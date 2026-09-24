# HealthSync IoT Simulator

Mensimulasikan Samsung Galaxy Watch 4 yang mengirimkan vital signs ke EMQX MQTT broker untuk testing pipeline IoT HealthSync.

## Prerequisites

- Node.js ≥ 18
- EMQX MQTT broker berjalan (via `docker-compose up emqx`)
- Install dependencies: `npm install`

## Quick Start

```bash
cd healthsync/tools/iot-simulator
npm install
npm start          # normal scenario, 60 readings @ 5s interval
```

## Scenarios

| Scenario | Command | Heart Rate | SpO2 | Deskripsi |
|---|---|---|---|---|
| `normal` | `npm run normal` | 65–80 bpm | 97–99% | Tanda vital normal — monitoring rutin |
| `level1` | `npm run level1` | 122–135 bpm | 90–92% | ⚠️ Level 1 Warning — batas peringatan |
| `level2` | `npm run level2` | 152–165 bpm | 86–88% | 🟠 Level 2 Urgent — perlu perhatian segera |
| `critical` | `npm run critical` | 182–195 bpm | 81–85% | 🔴 Level 3 Critical — darurat |
| `recovery` | `npm run recovery` | 190 → 72 bpm | 82 → 97% | Mulai kritis, berangsur normal (10 readings) |
| `stress` | `npm run stress` | 70 → 190 bpm (progresif) | 99 → 82% | Peningkatan bertahap untuk stress-test alert engine |

## CLI Options

Semua opsi bisa dikombinasikan:

```bash
node simulate.js [options]

Options:
  --scenario=<name>    normal | level1 | level2 | critical | recovery | stress
  --patientId=<uuid>   Patient UUID yang terdaftar di sistem
  --deviceId=<id>      Device ID (default: GW6-TEST-001)
  --broker=<url>       MQTT broker URL (default: mqtt://localhost:1883)
  --interval=<ms>      Interval antar reading dalam ms (default: 5000)
  --count=<n>          Jumlah readings total (0 = infinite, default: 60)
  --help               Tampilkan help
```

## Contoh Penggunaan

### Kirim 10 reading normal ke patient tertentu
```bash
node simulate.js --scenario=normal --patientId=550e8400-e29b-41d4-a716-446655440000 --count=10
```

### Simulasi kondisi kritis tanpa batas (Ctrl+C untuk stop)
```bash
node simulate.js --scenario=critical --count=0
```

### Rapid-fire stress test: 100 readings @ 1 detik
```bash
node simulate.js --scenario=stress --count=100 --interval=1000
```

### Simulasi recovery dengan device berbeda
```bash
node simulate.js --scenario=recovery --deviceId=GW6-PROD-042 --patientId=<uuid>
```

### Kirim ke broker remote (staging/production)
```bash
node simulate.js --scenario=level2 --broker=mqtt://staging.healthsync.id:1883
```

## MQTT Payload Format

Setiap reading dikirim ke topic `healthsync/devices/<DEVICE_ID>/vitals` dengan format:

```json
{
  "device_id": "GW6-TEST-001",
  "patient_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-09-15T07:23:14.000Z",
  "vitals": {
    "heart_rate": 75,
    "spo2": 98.2,
    "systolic_bp": 120,
    "diastolic_bp": 80,
    "temperature": 36.5,
    "activity_level": "resting"
  },
  "battery_level": 94,
  "signal_strength": -48,
  "firmware_version": "2.1.3"
}
```

## Alert Thresholds

Alert engine (`alert-service` di port 4002) akan triggered berdasarkan kondisi berikut:

| Level | Kondisi |
|---|---|
| 🟢 NORMAL | HR ≤ 120 AND SpO2 ≥ 92% |
| 🟡 LEVEL_1 WARNING | HR > 120 OR SpO2 < 92% |
| 🟠 LEVEL_2 URGENT | HR > 150 OR SpO2 < 88% |
| 🔴 LEVEL_3 CRITICAL | HR > 180 OR SpO2 < 85% |

## Troubleshooting

**ECONNREFUSED — tidak bisa connect ke broker:**
```bash
# Pastikan EMQX berjalan
docker-compose up emqx -d

# Cek status
docker-compose ps emqx
```

**Monitor MQTT messages secara real-time:**
```bash
# Install mosquitto-clients (macOS)
brew install mosquitto

# Subscribe ke semua device
mosquitto_sub -h localhost -p 1883 -t "healthsync/devices/+/vitals"
```

**EMQX Dashboard:**
Buka `http://localhost:18083` (user: `admin`, password: `healthsync_emqx_2026`) untuk melihat koneksi dan messages secara visual.
