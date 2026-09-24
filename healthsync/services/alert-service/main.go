package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"
)

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

type Config struct {
	Port              string
	KafkaBrokers      string
	KafkaTopicVitals  string
	KafkaTopicAlerts  string
	DatabaseURL       string
	RedisURL          string
}

func loadConfig() Config {
	return Config{
		Port:             getEnv("PORT", "4002"),
		KafkaBrokers:     getEnv("KAFKA_BROKERS", "localhost:9092"),
		KafkaTopicVitals: getEnv("KAFKA_TOPIC_VITALS", "vital-signs"),
		KafkaTopicAlerts: getEnv("KAFKA_TOPIC_ALERTS", "alerts"),
		DatabaseURL:      getEnv("DATABASE_URL", ""),
		RedisURL:         getEnv("REDIS_URL", "redis://localhost:6379"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ─────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────

// VitalPayload mirrors the struct published by iot-ingestion.
type VitalPayload struct {
	DeviceID        string  `json:"device_id"`
	PatientID       string  `json:"patient_id"`
	Timestamp       string  `json:"timestamp"`
	Vitals          Vitals  `json:"vitals"`
	BatteryLevel    int     `json:"battery_level"`
	SignalStrength  int     `json:"signal_strength"`
	FirmwareVersion string  `json:"firmware_version"`
}

type Vitals struct {
	HeartRate     int     `json:"heart_rate"`
	SpO2          float64 `json:"spo2"`
	SystolicBP    int     `json:"systolic_bp"`
	DiastolicBP   int     `json:"diastolic_bp"`
	Temperature   float64 `json:"temperature"`
	ActivityLevel string  `json:"activity_level"`
}

// AlertEvent is the Kafka event published to the "alerts" topic.
type AlertEvent struct {
	AlertID   string  `json:"alert_id"`
	PatientID string  `json:"patient_id"`
	Level     string  `json:"level"`     // "LEVEL_1" | "LEVEL_2" | "LEVEL_3"
	Metric    string  `json:"metric"`
	Value     float64 `json:"value"`
	Threshold float64 `json:"threshold"`
	Message   string  `json:"message"`
	CreatedAt string  `json:"created_at"`
}

// ─────────────────────────────────────────────
// Threshold rules
// ─────────────────────────────────────────────

type ThresholdBound struct {
	Min             *float64
	Max             *float64
	DurationSeconds int
}

type ThresholdRule struct {
	Metric string
	Level1 *ThresholdBound // Warning
	Level2 *ThresholdBound // Urgent
	Level3 *ThresholdBound // Critical
}

func ptr(f float64) *float64 { return &f }

// ThresholdBreach records a single metric breach detected by checkThresholds.
type ThresholdBreach struct {
	Metric    string
	Level     string
	Value     float64
	Threshold float64
}

// checkThresholds evaluates a VitalPayload against DefaultThresholds and returns
// every threshold breach (highest severity only per metric).
func checkThresholds(payload VitalPayload) []ThresholdBreach {
	var breaches []ThresholdBreach
	hr := float64(payload.Vitals.HeartRate)
	spo2 := payload.Vitals.SpO2
	temp := payload.Vitals.Temperature

	// Heart rate — highest severity first
	if hr > 180 {
		breaches = append(breaches, ThresholdBreach{"heart_rate", "LEVEL_3", hr, 180})
	} else if hr > 150 {
		breaches = append(breaches, ThresholdBreach{"heart_rate", "LEVEL_2", hr, 150})
	} else if hr > 120 {
		breaches = append(breaches, ThresholdBreach{"heart_rate", "LEVEL_1", hr, 120})
	}

	// SpO2
	if spo2 < 85 {
		breaches = append(breaches, ThresholdBreach{"spo2", "LEVEL_3", spo2, 85})
	} else if spo2 < 88 {
		breaches = append(breaches, ThresholdBreach{"spo2", "LEVEL_2", spo2, 88})
	} else if spo2 < 92 {
		breaches = append(breaches, ThresholdBreach{"spo2", "LEVEL_1", spo2, 92})
	}

	// Temperature
	if temp > 40 {
		breaches = append(breaches, ThresholdBreach{"temperature", "LEVEL_3", temp, 40})
	} else if temp > 39 {
		breaches = append(breaches, ThresholdBreach{"temperature", "LEVEL_2", temp, 39})
	} else if temp > 38 {
		breaches = append(breaches, ThresholdBreach{"temperature", "LEVEL_1", temp, 38})
	}

	return breaches
}

var DefaultThresholds = []ThresholdRule{
	{
		Metric: "heart_rate",
		Level1: &ThresholdBound{Max: ptr(120.0), DurationSeconds: 120},
		Level2: &ThresholdBound{Max: ptr(150.0), DurationSeconds: 60},
		Level3: &ThresholdBound{Max: ptr(180.0), DurationSeconds: 30},
	},
	{
		Metric: "spo2",
		Level1: &ThresholdBound{Min: ptr(92.0), DurationSeconds: 120},
		Level2: &ThresholdBound{Min: ptr(88.0), DurationSeconds: 60},
		Level3: &ThresholdBound{Min: ptr(85.0), DurationSeconds: 30},
	},
	{
		Metric: "temperature",
		Level1: &ThresholdBound{Max: ptr(38.0), DurationSeconds: 120},
		Level2: &ThresholdBound{Max: ptr(39.0), DurationSeconds: 60},
		Level3: &ThresholdBound{Max: ptr(40.0), DurationSeconds: 30},
	},
}

// samplingIntervalSeconds is the assumed interval between device readings.
const samplingIntervalSeconds = 15

// isBreach checks whether a value breaches a ThresholdBound.
func isBreach(bound *ThresholdBound, value float64) (bool, float64) {
	if bound == nil {
		return false, 0
	}
	if bound.Max != nil && value > *bound.Max {
		return true, *bound.Max
	}
	if bound.Min != nil && value < *bound.Min {
		return true, *bound.Min
	}
	return false, 0
}

// ─────────────────────────────────────────────
// Vital value extractor
// ─────────────────────────────────────────────

func getMetricValue(payload VitalPayload, metric string) (float64, bool) {
	switch metric {
	case "heart_rate":
		return float64(payload.Vitals.HeartRate), payload.Vitals.HeartRate > 0
	case "spo2":
		return payload.Vitals.SpO2, payload.Vitals.SpO2 > 0
	case "temperature":
		return payload.Vitals.Temperature, payload.Vitals.Temperature > 0
	case "systolic_bp":
		return float64(payload.Vitals.SystolicBP), payload.Vitals.SystolicBP > 0
	case "diastolic_bp":
		return float64(payload.Vitals.DiastolicBP), payload.Vitals.DiastolicBP > 0
	}
	return 0, false
}

// ─────────────────────────────────────────────
// Kafka writer (alert publisher)
// ─────────────────────────────────────────────

func newAlertWriter(brokers, topic string) *kafka.Writer {
	return &kafka.Writer{
		Addr:         kafka.TCP(strings.Split(brokers, ",")...),
		Topic:        topic,
		Balancer:     &kafka.LeastBytes{},
		RequiredAcks: kafka.RequireOne,
		Async:        false,
		MaxAttempts:  3,
	}
}

func publishAlert(writer *kafka.Writer, event AlertEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal alert event: %w", err)
	}
	return writer.WriteMessages(context.Background(), kafka.Message{
		Key:   []byte(event.PatientID),
		Value: data,
	})
}

// ─────────────────────────────────────────────
// Alert persistence helpers
// ─────────────────────────────────────────────

func hasActiveAlert(ctx context.Context, db *sql.DB, patientID, metric, level string) (string, bool) {
	var id string
	err := db.QueryRowContext(ctx,
		`SELECT id FROM alerts WHERE patient_id=$1 AND trigger_metric=$2 AND level=$3 AND status='ACTIVE' LIMIT 1`,
		patientID, metric, level,
	).Scan(&id)
	if err != nil {
		return "", false
	}
	return id, true
}

func insertAlert(ctx context.Context, db *sql.DB, event AlertEvent) error {
	_, err := db.ExecContext(ctx,
		`INSERT INTO alerts (id, patient_id, level, trigger_metric, trigger_value, threshold_value, message, status, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', NOW())`,
		event.AlertID, event.PatientID, event.Level, event.Metric,
		event.Value, event.Threshold, event.Message,
	)
	return err
}

// ─────────────────────────────────────────────
// Alert evaluation engine
// ─────────────────────────────────────────────

func processVitalMessage(ctx context.Context, payload []byte, db *sql.DB, rdb *redis.Client, writer *kafka.Writer) {
	var vital VitalPayload
	if err := json.Unmarshal(payload, &vital); err != nil {
		slog.Error("processVitalMessage: unmarshal error", "error", err)
		return
	}

	for _, rule := range DefaultThresholds {
		value, ok := getMetricValue(vital, rule.Metric)
		if !ok {
			continue
		}

		type levelEntry struct {
			label string
			bound *ThresholdBound
		}
		// Evaluate highest severity first; only trigger the worst breach.
		levels := []levelEntry{
			{"LEVEL_3", rule.Level3},
			{"LEVEL_2", rule.Level2},
			{"LEVEL_1", rule.Level1},
		}

		for _, lvl := range levels {
			breached, threshold := isBreach(lvl.bound, value)
			breachKey := fmt.Sprintf("alert:breach:%s:%s:%s", vital.PatientID, rule.Metric, lvl.label)

			if !breached {
				// Clear breach counter if recovered
				rdb.Del(ctx, breachKey)
				continue
			}

			// Track sustained breach with Redis INCR
			count, err := rdb.Incr(ctx, breachKey).Result()
			if err != nil {
				slog.Error("redis INCR breach error", "error", err, "key", breachKey)
				break
			}
			// Set TTL on first breach
			if count == 1 {
				rdb.Expire(ctx, breachKey, time.Duration(lvl.bound.DurationSeconds*3)*time.Second)
			}

			// Only trigger when breach has persisted long enough
			requiredSamples := int64(lvl.bound.DurationSeconds / samplingIntervalSeconds)
			if requiredSamples < 1 {
				requiredSamples = 1
			}
			if count < requiredSamples {
				break
			}

			// Trigger alert — deduplicate by checking for existing ACTIVE alert
			if _, exists := hasActiveAlert(ctx, db, vital.PatientID, rule.Metric, lvl.label); exists {
				break
			}

			event := AlertEvent{
				AlertID:   uuid.New().String(),
				PatientID: vital.PatientID,
				Level:     lvl.label,
				Metric:    rule.Metric,
				Value:     value,
				Threshold: threshold,
				Message:   fmt.Sprintf("%s breached %s threshold: %.2f (threshold: %.2f)", rule.Metric, lvl.label, value, threshold),
				CreatedAt: time.Now().UTC().Format(time.RFC3339),
			}

			if err := insertAlert(ctx, db, event); err != nil {
				slog.Error("insertAlert error", "error", err, "patient", vital.PatientID, "metric", rule.Metric)
				break
			}

			if err := publishAlert(writer, event); err != nil {
				slog.Error("publishAlert error", "error", err, "alert_id", event.AlertID)
			} else {
				slog.Info("alert triggered", "alert_id", event.AlertID, "patient", vital.PatientID,
					"metric", rule.Metric, "level", lvl.label, "value", value)
			}

			break // stop at the highest triggered level per metric
		}
	}
}

// ─────────────────────────────────────────────
// Kafka consumer
// ─────────────────────────────────────────────

func startKafkaConsumer(ctx context.Context, cfg Config, db *sql.DB, rdb *redis.Client, writer *kafka.Writer) {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        strings.Split(cfg.KafkaBrokers, ","),
		Topic:          cfg.KafkaTopicVitals,
		GroupID:        "alert-service-group",
		MinBytes:       1,
		MaxBytes:       10e6,
		CommitInterval: time.Second,
	})
	defer reader.Close()

	for {
		msg, err := reader.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return // context cancelled — shutdown
			}
			slog.Error("kafka read error", "error", err)
			continue
		}
		go processVitalMessage(ctx, msg.Value, db, rdb, writer)
	}
}

// ─────────────────────────────────────────────
// Auto-escalation checker (runs every 30s)
// ─────────────────────────────────────────────

func checkAutoEscalation(ctx context.Context, db *sql.DB) {
	// Escalate LEVEL_1 alerts that have been ACTIVE for >5 min with no acknowledgement.
	rows, err := db.QueryContext(ctx,
		`SELECT id FROM alerts
		 WHERE status='ACTIVE' AND level='LEVEL_1'
		   AND acknowledged_by IS NULL
		   AND created_at < NOW() - INTERVAL '5 minutes'`,
	)
	if err != nil {
		slog.Error("auto-escalation query error", "error", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			slog.Error("auto-escalation scan error", "error", err)
			continue
		}
		_, err := db.ExecContext(ctx,
			`UPDATE alerts SET level='LEVEL_2', escalated_to_level='LEVEL_2' WHERE id=$1`,
			id,
		)
		if err != nil {
			slog.Error("auto-escalation update error", "error", err, "alert_id", id)
		} else {
			slog.Info("alert auto-escalated to LEVEL_2", "alert_id", id)
		}
	}
}

func startEscalationChecker(ctx context.Context, db *sql.DB) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			checkAutoEscalation(ctx, db)
		}
	}
}

// ─────────────────────────────────────────────
// HTTP handlers
// ─────────────────────────────────────────────

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"service": "alert-service",
	})
}

func makeAlertsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		q := r.URL.Query()
		patientID := q.Get("patientId")
		status := q.Get("status")
		level := q.Get("level")
		limit := 20
		offset := 0
		fmt.Sscanf(q.Get("limit"), "%d", &limit)
		fmt.Sscanf(q.Get("offset"), "%d", &offset)
		if limit <= 0 || limit > 200 {
			limit = 20
		}

		query := `SELECT id, patient_id, level, trigger_metric, trigger_value, threshold_value,
		                 message, status, acknowledged_by, acknowledged_at, resolved_at, created_at
		          FROM alerts WHERE 1=1`
		args := []interface{}{}
		idx := 1

		if patientID != "" {
			query += fmt.Sprintf(" AND patient_id=$%d", idx)
			args = append(args, patientID)
			idx++
		}
		if status != "" {
			query += fmt.Sprintf(" AND status=$%d", idx)
			args = append(args, status)
			idx++
		}
		if level != "" {
			query += fmt.Sprintf(" AND level=$%d", idx)
			args = append(args, level)
			idx++
		}
		query += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", idx, idx+1)
		args = append(args, limit, offset)

		rows, err := db.QueryContext(r.Context(), query, args...)
		if err != nil {
			slog.Error("alerts list query error", "error", err)
			http.Error(w, `{"error":"internal server error"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type AlertRow struct {
			ID               string  `json:"id"`
			PatientID        string  `json:"patient_id"`
			Level            string  `json:"level"`
			TriggerMetric    string  `json:"trigger_metric"`
			TriggerValue     float64 `json:"trigger_value"`
			TriggerThreshold float64 `json:"trigger_threshold"`
			Message          string  `json:"message"`
			Status           string  `json:"status"`
			AcknowledgedBy   *string `json:"acknowledged_by,omitempty"`
			AcknowledgedAt   *string `json:"acknowledged_at,omitempty"`
			ResolvedAt       *string `json:"resolved_at,omitempty"`
			CreatedAt        string  `json:"created_at"`
		}

		alerts := []AlertRow{}
		for rows.Next() {
			var a AlertRow
			if err := rows.Scan(&a.ID, &a.PatientID, &a.Level, &a.TriggerMetric, &a.TriggerValue,
				&a.TriggerThreshold, &a.Message, &a.Status, &a.AcknowledgedBy,
				&a.AcknowledgedAt, &a.ResolvedAt, &a.CreatedAt); err != nil {
				slog.Error("alerts scan error", "error", err)
				continue
			}
			alerts = append(alerts, a)
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"data": alerts,
			"meta": map[string]interface{}{"limit": limit, "offset": offset},
		})
	}
}

func makeActiveAlertsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		rows, err := db.QueryContext(r.Context(),
			`SELECT a.id, a.patient_id, a.level, a.trigger_metric, a.trigger_value,
			        a.threshold_value, a.message, a.status, a.created_at,
			        p.name AS patient_name
			 FROM alerts a
			 JOIN patients p ON p.id = a.patient_id
			 WHERE a.status='ACTIVE'
			 ORDER BY a.level DESC, a.created_at ASC`,
		)
		if err != nil {
			slog.Error("active alerts query error", "error", err)
			http.Error(w, `{"error":"internal server error"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type ActiveAlert struct {
			ID               string  `json:"id"`
			PatientID        string  `json:"patient_id"`
			PatientName      string  `json:"patient_name"`
			Level            string  `json:"level"`
			TriggerMetric    string  `json:"trigger_metric"`
			TriggerValue     float64 `json:"trigger_value"`
			TriggerThreshold float64 `json:"trigger_threshold"`
			Message          string  `json:"message"`
			Status           string  `json:"status"`
			CreatedAt        string  `json:"created_at"`
		}

		alerts := []ActiveAlert{}
		for rows.Next() {
			var a ActiveAlert
			if err := rows.Scan(&a.ID, &a.PatientID, &a.Level, &a.TriggerMetric, &a.TriggerValue,
				&a.TriggerThreshold, &a.Message, &a.Status, &a.CreatedAt, &a.PatientName); err != nil {
				slog.Error("active alerts scan error", "error", err)
				continue
			}
			alerts = append(alerts, a)
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"data": alerts})
	}
}

func makeAcknowledgeHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		// Extract alert ID from path: /v1/alerts/{id}/acknowledge
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) < 3 {
			http.Error(w, `{"error":"invalid path"}`, http.StatusBadRequest)
			return
		}
		alertID := parts[2]

		var body struct {
			AcknowledgedBy string `json:"acknowledgedBy"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.AcknowledgedBy == "" {
			http.Error(w, `{"error":"acknowledgedBy is required"}`, http.StatusBadRequest)
			return
		}

		result, err := db.ExecContext(r.Context(),
			`UPDATE alerts SET status='ACKNOWLEDGED', acknowledged_by=$1, acknowledged_at=NOW()
			 WHERE id=$2 AND status='ACTIVE'`,
			body.AcknowledgedBy, alertID,
		)
		if err != nil {
			slog.Error("acknowledge alert error", "error", err, "alert_id", alertID)
			http.Error(w, `{"error":"internal server error"}`, http.StatusInternalServerError)
			return
		}
		n, _ := result.RowsAffected()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"id": alertID, "updated": n > 0})
	}
}

func makeResolveHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) < 3 {
			http.Error(w, `{"error":"invalid path"}`, http.StatusBadRequest)
			return
		}
		alertID := parts[2]
		result, err := db.ExecContext(r.Context(),
			`UPDATE alerts SET status='RESOLVED', resolved_at=NOW() WHERE id=$1`,
			alertID,
		)
		if err != nil {
			slog.Error("resolve alert error", "error", err, "alert_id", alertID)
			http.Error(w, `{"error":"internal server error"}`, http.StatusInternalServerError)
			return
		}
		n, _ := result.RowsAffected()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"id": alertID, "updated": n > 0})
	}
}

func makeFalsePositiveHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) < 3 {
			http.Error(w, `{"error":"invalid path"}`, http.StatusBadRequest)
			return
		}
		alertID := parts[2]
		result, err := db.ExecContext(r.Context(),
			`UPDATE alerts SET status='FALSE_POSITIVE', acknowledged_at=NOW() WHERE id=$1`,
			alertID,
		)
		if err != nil {
			slog.Error("false-positive alert error", "error", err, "alert_id", alertID)
			http.Error(w, `{"error":"internal server error"}`, http.StatusInternalServerError)
			return
		}
		n, _ := result.RowsAffected()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"id": alertID, "updated": n > 0})
	}
}

// alertActionRouter dispatches /v1/alerts/{id}/{action} to the correct handler.
func alertActionRouter(
	acknowledgeH, resolveH, falsePositiveH http.HandlerFunc,
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		// parts: ["v1", "alerts", "{id}", "{action}"]
		if len(parts) < 4 {
			http.Error(w, "Not Found", http.StatusNotFound)
			return
		}
		action := parts[3]
		switch action {
		case "acknowledge":
			acknowledgeH(w, r)
		case "resolve":
			resolveH(w, r)
		case "false-positive":
			falsePositiveH(w, r)
		default:
			http.Error(w, "Not Found", http.StatusNotFound)
		}
	}
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

func main() {
	// 1. Structured logger
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	// 2. Load config
	cfg := loadConfig()

	// 3. Connect DB
	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		slog.Error("DB open error", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	db.SetMaxOpenConns(15)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	// 4. Connect Redis
	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		slog.Error("Redis URL parse error", "error", err)
		os.Exit(1)
	}
	rdb := redis.NewClient(redisOpts)
	defer rdb.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Create Kafka alert writer
	alertWriter := newAlertWriter(cfg.KafkaBrokers, cfg.KafkaTopicAlerts)
	defer alertWriter.Close()

	// 5. Start Kafka consumer
	go startKafkaConsumer(ctx, cfg, db, rdb, alertWriter)

	// 6. Start escalation checker
	go startEscalationChecker(ctx, db)

	// 7. Register HTTP routes
	acknowledgeH := makeAcknowledgeHandler(db)
	resolveH := makeResolveHandler(db)
	falsePositiveH := makeFalsePositiveHandler(db)
	actionRouter := alertActionRouter(acknowledgeH, resolveH, falsePositiveH)

	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/v1/alerts/active", makeActiveAlertsHandler(db))
	mux.HandleFunc("/v1/alerts/", actionRouter)
	mux.HandleFunc("/v1/alerts", makeAlertsHandler(db))

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		slog.Info("alert-service HTTP server started", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("HTTP server error", "error", err)
			os.Exit(1)
		}
	}()

	// 8. Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("alert-service shutting down...")
	cancel() // stop consumer + escalation checker

	shutCtx, shutCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutCancel()

	if err := srv.Shutdown(shutCtx); err != nil {
		slog.Error("HTTP shutdown error", "error", err)
	}

	slog.Info("alert-service stopped cleanly")
}
