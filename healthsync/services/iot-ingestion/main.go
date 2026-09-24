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
	"sync/atomic"
	"syscall"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"
)

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

type Config struct {
	MQTTBroker      string
	MQTTClientID    string
	MQTTUsername    string
	MQTTPassword    string
	KafkaBrokers    string
	KafkaTopic      string
	DatabaseURL     string
	RedisURL        string
	Port            string
}

func loadConfig() Config {
	return Config{
		MQTTBroker:   getEnv("MQTT_BROKER", "tcp://localhost:1883"),
		MQTTClientID: getEnv("MQTT_CLIENT_ID", "iot-ingestion-1"),
		MQTTUsername: getEnv("MQTT_USERNAME", ""),
		MQTTPassword: getEnv("MQTT_PASSWORD", ""),
		KafkaBrokers: getEnv("KAFKA_BROKERS", "localhost:9092"),
		KafkaTopic:   getEnv("KAFKA_TOPIC_VITALS", "vital-signs"),
		DatabaseURL:  getEnv("DATABASE_URL", ""),
		RedisURL:     getEnv("REDIS_URL", "redis://localhost:6379"),
		Port:         getEnv("PORT", "4001"),
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

type DeviceStatus struct {
	DeviceID     string `json:"device_id"`
	Status       string `json:"status"`
	BatteryLevel int    `json:"battery_level"`
}

// ─────────────────────────────────────────────
// Metrics counters (atomic for goroutine-safety)
// ─────────────────────────────────────────────

var (
	messagesProcessed int64
	messagesErrors    int64
	mqttConnected     atomic.Bool
)

// ─────────────────────────────────────────────
// Kafka producer
// ─────────────────────────────────────────────

func newKafkaWriter(brokers string, topic string) *kafka.Writer {
	return &kafka.Writer{
		Addr:         kafka.TCP(strings.Split(brokers, ",")...),
		Topic:        topic,
		Balancer:     &kafka.LeastBytes{},
		RequiredAcks: kafka.RequireOne,
		Async:        false, // synchronous for reliability
		MaxAttempts:  3,
	}
}

func publishVital(writer *kafka.Writer, payload VitalPayload) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal vital payload: %w", err)
	}
	return writer.WriteMessages(context.Background(), kafka.Message{
		Key:   []byte(payload.PatientID),
		Value: data,
	})
}

// ─────────────────────────────────────────────
// MQTT message handlers
// ─────────────────────────────────────────────

// handleVitalMessage is the MQTT handler for healthsync/devices/+/vitals
func makeVitalHandler(writer *kafka.Writer) mqtt.MessageHandler {
	return func(_ mqtt.Client, msg mqtt.Message) {
		var payload VitalPayload
		if err := json.Unmarshal(msg.Payload(), &payload); err != nil {
			slog.Error("vital message parse error", "error", err, "topic", msg.Topic())
			atomic.AddInt64(&messagesErrors, 1)
			return
		}

		// Validate required fields
		if payload.DeviceID == "" {
			slog.Error("vital message missing device_id", "topic", msg.Topic())
			atomic.AddInt64(&messagesErrors, 1)
			return
		}
		if _, err := uuid.Parse(payload.PatientID); err != nil {
			slog.Error("vital message invalid patient_id", "patient_id", payload.PatientID, "topic", msg.Topic())
			atomic.AddInt64(&messagesErrors, 1)
			return
		}

		if err := publishVital(writer, payload); err != nil {
			slog.Error("kafka publish error", "error", err, "device", payload.DeviceID)
			atomic.AddInt64(&messagesErrors, 1)
			return
		}

		atomic.AddInt64(&messagesProcessed, 1)
		slog.Info("vital ingested", "device", payload.DeviceID, "patient", payload.PatientID)
	}
}

// handleStatusMessage is the MQTT handler for healthsync/devices/+/status
func makeStatusHandler(db *sql.DB, rdb *redis.Client) mqtt.MessageHandler {
	return func(_ mqtt.Client, msg mqtt.Message) {
		var status DeviceStatus
		if err := json.Unmarshal(msg.Payload(), &status); err != nil {
			slog.Error("status message parse error", "error", err, "topic", msg.Topic())
			return
		}
		if status.DeviceID == "" {
			return
		}

		ctx := context.Background()

		// Update last_seen_at in DB
		_, err := db.ExecContext(ctx,
			`UPDATE iot_devices SET last_seen_at=NOW() WHERE device_id=$1`,
			status.DeviceID,
		)
		if err != nil {
			slog.Error("db update device last_seen_at error", "error", err, "device", status.DeviceID)
		}

		// Cache offline devices in Redis
		if status.Status == "offline" {
			key := fmt.Sprintf("device:offline:%s", status.DeviceID)
			if err := rdb.Set(ctx, key, "1", 300*time.Second).Err(); err != nil {
				slog.Error("redis set offline device error", "error", err, "device", status.DeviceID)
			}
		}
	}
}

// ─────────────────────────────────────────────
// MQTT client
// ─────────────────────────────────────────────

func connectMQTT(cfg Config, writer *kafka.Writer, db *sql.DB, rdb *redis.Client) mqtt.Client {
	vitalHandler := makeVitalHandler(writer)
	statusHandler := makeStatusHandler(db, rdb)

	opts := mqtt.NewClientOptions()
	opts.AddBroker(cfg.MQTTBroker)
	opts.SetClientID(cfg.MQTTClientID)
	opts.SetUsername(cfg.MQTTUsername)
	opts.SetPassword(cfg.MQTTPassword)
	opts.SetCleanSession(false)
	opts.SetAutoReconnect(true)
	opts.SetMaxReconnectInterval(30 * time.Second)
	opts.SetConnectionLostHandler(func(_ mqtt.Client, err error) {
		mqttConnected.Store(false)
		slog.Error("MQTT connection lost", "error", err)
	})
	opts.SetOnConnectHandler(func(c mqtt.Client) {
		mqttConnected.Store(true)
		slog.Info("MQTT connected, subscribing...")
		// QoS 1 for vitals (at least once delivery)
		token := c.Subscribe("healthsync/devices/+/vitals", 1, vitalHandler)
		token.Wait()
		if err := token.Error(); err != nil {
			slog.Error("MQTT subscribe vitals error", "error", err)
		}
		// QoS 0 for status (best effort)
		c.Subscribe("healthsync/devices/+/status", 0, statusHandler)
	})

	client := mqtt.NewClient(opts)
	token := client.Connect()
	token.Wait()
	if err := token.Error(); err != nil {
		slog.Error("MQTT initial connect error", "error", err)
	}
	return client
}

// ─────────────────────────────────────────────
// HTTP handlers
// ─────────────────────────────────────────────

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":              "ok",
		"service":             "iot-ingestion",
		"mqtt_connected":      mqttConnected.Load(),
		"messages_processed":  atomic.LoadInt64(&messagesProcessed),
	})
}

func metricsHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "iot_messages_processed_total{service=\"iot-ingestion\"} %d\n", atomic.LoadInt64(&messagesProcessed))
	fmt.Fprintf(w, "iot_messages_errors_total{service=\"iot-ingestion\"} %d\n", atomic.LoadInt64(&messagesErrors))
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

	// 3. Connect to DB
	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		slog.Error("DB open error", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	// 4. Connect to Redis
	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		slog.Error("Redis URL parse error", "error", err)
		os.Exit(1)
	}
	rdb := redis.NewClient(redisOpts)
	defer rdb.Close()

	// 5. Create Kafka writer
	writer := newKafkaWriter(cfg.KafkaBrokers, cfg.KafkaTopic)
	defer writer.Close()

	// 6. Connect MQTT + subscribe
	mqttClient := connectMQTT(cfg, writer, db, rdb)

	// 7. Start HTTP server
	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/metrics", metricsHandler)

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		slog.Info("iot-ingestion HTTP server started", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("HTTP server error", "error", err)
			os.Exit(1)
		}
	}()

	// 8. Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("iot-ingestion shutting down...")

	shutCtx, shutCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutCancel()

	if err := srv.Shutdown(shutCtx); err != nil {
		slog.Error("HTTP shutdown error", "error", err)
	}

	mqttClient.Disconnect(2000)

	if err := writer.Close(); err != nil {
		slog.Error("Kafka writer close error", "error", err)
	}

	slog.Info("iot-ingestion stopped cleanly")
}
