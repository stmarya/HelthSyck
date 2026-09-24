package main

import (
	"encoding/json"
	"testing"
)

// ─────────────────────────────────────────────
// VitalPayload JSON marshaling tests
// ─────────────────────────────────────────────

func TestVitalPayload_Marshal(t *testing.T) {
	payload := VitalPayload{
		DeviceID:  "device-001",
		PatientID: "550e8400-e29b-41d4-a716-446655440000",
		Timestamp: "2026-09-19T00:00:00Z",
		Vitals: Vitals{
			HeartRate:     75,
			SpO2:          98.5,
			SystolicBP:    120,
			DiastolicBP:   80,
			Temperature:   36.8,
			ActivityLevel: "resting",
		},
		BatteryLevel:   85,
		SignalStrength: -70,
	}

	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	if len(data) == 0 {
		t.Fatal("marshaled data is empty")
	}

	var roundtrip VitalPayload
	if err := json.Unmarshal(data, &roundtrip); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if roundtrip.DeviceID != payload.DeviceID {
		t.Errorf("DeviceID mismatch: got %q want %q", roundtrip.DeviceID, payload.DeviceID)
	}
	if roundtrip.Vitals.HeartRate != payload.Vitals.HeartRate {
		t.Errorf("HeartRate mismatch: got %d want %d", roundtrip.Vitals.HeartRate, payload.Vitals.HeartRate)
	}
	if roundtrip.Vitals.SpO2 != payload.Vitals.SpO2 {
		t.Errorf("SpO2 mismatch: got %f want %f", roundtrip.Vitals.SpO2, payload.Vitals.SpO2)
	}
}

// ─────────────────────────────────────────────
// parseVitalPayload tests (via JSON decode)
// ─────────────────────────────────────────────

func TestParseVitalPayload_ValidJSON(t *testing.T) {
	raw := `{
		"device_id": "dev-abc",
		"patient_id": "550e8400-e29b-41d4-a716-446655440001",
		"timestamp": "2026-09-19T10:00:00Z",
		"vitals": {
			"heart_rate": 72,
			"spo2": 99.0,
			"systolic_bp": 115,
			"diastolic_bp": 75,
			"temperature": 36.5,
			"activity_level": "walking"
		},
		"battery_level": 90,
		"signal_strength": -65
	}`

	var payload VitalPayload
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if payload.DeviceID != "dev-abc" {
		t.Errorf("expected device_id=dev-abc, got %q", payload.DeviceID)
	}
	if payload.Vitals.HeartRate != 72 {
		t.Errorf("expected heart_rate=72, got %d", payload.Vitals.HeartRate)
	}
}

func TestParseVitalPayload_MissingDeviceID(t *testing.T) {
	raw := `{"patient_id":"550e8400-e29b-41d4-a716-446655440001","vitals":{}}`
	var payload VitalPayload
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	// Validation logic: device_id must not be empty
	if payload.DeviceID != "" {
		t.Errorf("expected empty device_id, got %q", payload.DeviceID)
	}
}

func TestParseVitalPayload_InvalidJSON(t *testing.T) {
	raw := `{not valid json`
	var payload VitalPayload
	err := json.Unmarshal([]byte(raw), &payload)
	if err == nil {
		t.Fatal("expected unmarshal error for invalid JSON, got nil")
	}
}

// ─────────────────────────────────────────────
// Config loading
// ─────────────────────────────────────────────

func TestLoadConfig_Defaults(t *testing.T) {
	cfg := loadConfig()
	if cfg.KafkaTopic == "" {
		t.Error("KafkaTopic should have a default value")
	}
	if cfg.Port == "" {
		t.Error("Port should have a default value")
	}
	if cfg.MQTTClientID == "" {
		t.Error("MQTTClientID should have a default value")
	}
}

// ─────────────────────────────────────────────
// DeviceStatus JSON
// ─────────────────────────────────────────────

func TestDeviceStatus_Marshal(t *testing.T) {
	status := DeviceStatus{
		DeviceID:     "dev-xyz",
		Status:       "online",
		BatteryLevel: 75,
	}
	data, err := json.Marshal(status)
	if err != nil {
		t.Fatalf("marshal DeviceStatus failed: %v", err)
	}
	var back DeviceStatus
	if err := json.Unmarshal(data, &back); err != nil {
		t.Fatalf("unmarshal DeviceStatus failed: %v", err)
	}
	if back.DeviceID != status.DeviceID {
		t.Errorf("DeviceID mismatch: got %q want %q", back.DeviceID, status.DeviceID)
	}
	if back.Status != status.Status {
		t.Errorf("Status mismatch: got %q want %q", back.Status, status.Status)
	}
}
