package main

import (
	"encoding/json"
	"testing"
)

func TestEvaluateVitals_NormalReadings(t *testing.T) {
	payload := VitalPayload{
		DeviceID:  "GW6-TEST-001",
		PatientID: "550e8400-e29b-41d4-a716-446655440000",
		Vitals: Vitals{
			HeartRate:   75,
			SpO2:        98.0,
			Temperature: 36.5,
		},
	}

	breaches := checkThresholds(payload)
	if len(breaches) != 0 {
		t.Errorf("expected 0 threshold breaches for normal vitals, got %d", len(breaches))
	}
}

func TestEvaluateVitals_Level3HeartRate(t *testing.T) {
	payload := VitalPayload{
		DeviceID:  "GW6-TEST-001",
		PatientID: "550e8400-e29b-41d4-a716-446655440000",
		Vitals: Vitals{
			HeartRate:   185,
			SpO2:        98.0,
			Temperature: 36.5,
		},
	}

	breaches := checkThresholds(payload)
	found := false
	for _, b := range breaches {
		if b.Metric == "heart_rate" && b.Level == "LEVEL_3" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected LEVEL_3 breach for heart_rate=185")
	}
}

func TestEvaluateVitals_Level1SpO2(t *testing.T) {
	payload := VitalPayload{
		DeviceID:  "GW6-TEST-001",
		PatientID: "550e8400-e29b-41d4-a716-446655440000",
		Vitals: Vitals{
			HeartRate:   75,
			SpO2:        91.0, // below 92 = Level 1
			Temperature: 36.5,
		},
	}

	breaches := checkThresholds(payload)
	found := false
	for _, b := range breaches {
		if b.Metric == "spo2" && b.Level == "LEVEL_1" {
			found = true
		}
	}
	if !found {
		t.Error("expected LEVEL_1 breach for spo2=91.0")
	}
}

func TestAlertMessage_Format(t *testing.T) {
	event := AlertEvent{
		AlertID:   "alert-uuid-1",
		PatientID: "patient-uuid-1",
		Level:     "LEVEL_2",
		Metric:    "spo2",
		Value:     87.5,
		Threshold: 88.0,
		Message:   "SpO2 87.5% below threshold 88.0%",
	}

	data, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("failed to marshal AlertEvent: %v", err)
	}

	var decoded AlertEvent
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("failed to unmarshal AlertEvent: %v", err)
	}

	if decoded.Level != "LEVEL_2" {
		t.Errorf("expected Level LEVEL_2, got %s", decoded.Level)
	}
	if decoded.Value != 87.5 {
		t.Errorf("expected Value 87.5, got %f", decoded.Value)
	}
}
