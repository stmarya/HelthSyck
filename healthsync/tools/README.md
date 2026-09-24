# HealthSync Tools

Folder ini berisi tooling untuk development dan testing HealthSync.

```
tools/
├── postman/                  # Postman Collection & Environment
│   ├── HealthSync.postman_collection.json
│   └── HealthSync.dev.postman_environment.json
└── iot-simulator/            # MQTT IoT device simulator
    ├── simulate.js
    ├── package.json
    └── README.md
```

---

## 📮 Postman Collection

Lokasi: [`postman/`](./postman/)

### File

| File | Keterangan |
|---|---|
| `HealthSync.postman_collection.json` | Collection v2.1 — 8 folder, 40+ requests |
| `HealthSync.dev.postman_environment.json` | Environment untuk localhost dev |

### Import ke Postman

1. Buka Postman → **Import**
2. Pilih kedua file sekaligus (Collection + Environment)
3. Aktifkan environment **"HealthSync — Local Development"** di pojok kanan atas
4. Jalankan folder **🔐 Auth Flow** terlebih dahulu — tokens otomatis tersimpan ke collection variables

### Struktur Collection

| Folder | Jumlah Requests | Deskripsi |
|---|---|---|
| 🔐 Auth Flow | 6 | Register, Login, Get Me, Refresh Token |
| 👤 Patient Flow | 7 | Buat profil, vital signs, kondisi medis, pair device IoT |
| 💬 Consultation Flow | 7 | Buat konsultasi, chat pasien-dokter, selesaikan konsultasi |
| 💊 Prescription Flow | 3 | Terbitkan resep, pilih apotek |
| 🏥 Hospital Search Flow | 3 | Cari RS terdekat, detail, kapasitas |
| 🚑 Alert & Emergency Flow | 4 | Active alerts, ambulans terdekat |
| 🔄 Referral Flow | 2 | Buat & list surat rujukan |
| 🔧 Service Health Checks | 11 | Health check semua 11 service |

### Runner Otomatis (Collection Run)

Untuk menjalankan semua flow secara berurutan:

1. Klik kanan collection → **Run collection**
2. Pilih **Select All** → aktifkan **Save responses**
3. Klik **Run HealthSync Indonesia API**

> **Catatan:** Jalankan folder Auth Flow terlebih dahulu agar `access_token`, `doctor_access_token`, dan `patient_id` terisi sebelum flow lain dijalankan.

---

## 📡 IoT Simulator

Lokasi: [`iot-simulator/`](./iot-simulator/)

Mensimulasikan Samsung Galaxy Watch 4 yang mengirimkan vital signs ke EMQX via MQTT.

### Setup

```bash
cd healthsync/tools/iot-simulator
npm install
```

### Jalankan

```bash
# Scenario normal (default)
npm start

# Atau pilih scenario spesifik
npm run level1       # Warning threshold
npm run level2       # Urgent threshold
npm run critical     # Critical — trigger emergency alert
npm run recovery     # Starts critical, recovers over 10 readings
npm run stress       # Progresif: HR naik 70 → 190

# Custom via CLI
node simulate.js --scenario=critical --patientId=<uuid> --count=0
```

### Topic MQTT

```
healthsync/devices/<DEVICE_ID>/vitals
```

### Alert Thresholds

| Level | HR | SpO2 |
|---|---|---|
| 🟢 NORMAL | ≤ 120 bpm | ≥ 92% |
| 🟡 LEVEL_1 WARNING | > 120 bpm | < 92% |
| 🟠 LEVEL_2 URGENT | > 150 bpm | < 88% |
| 🔴 LEVEL_3 CRITICAL | > 180 bpm | < 85% |

Lihat [`iot-simulator/README.md`](./iot-simulator/README.md) untuk dokumentasi lengkap.

---

## Prasyarat Umum

Sebelum menggunakan tools di atas, pastikan seluruh service HealthSync sudah berjalan:

```bash
# Dari root project
docker-compose up -d

# Cek semua service up
docker-compose ps
```

Service yang dibutuhkan beserta port-nya:

| Service | Port |
|---|---|
| auth-service | 3001 |
| patient-service | 3002 |
| consultation-service | 3003 |
| prescription-service | 3004 |
| ambulance-service | 3005 |
| referral-service | 3006 |
| hospital-service | 3007 |
| pharmacy-service | 3008 |
| notification-service | 3009 |
| iot-service | 4001 |
| alert-service | 4002 |
| EMQX MQTT Broker | 1883 |
| EMQX Dashboard | 18083 |
