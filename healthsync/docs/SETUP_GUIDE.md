# HealthSync — EMQX & MailHog Setup Guide

Panduan konfigurasi EMQX (MQTT broker) dan MailHog (SMTP catcher) untuk development lokal.

---

## EMQX — IoT MQTT Broker

### Akses Dashboard
Buka browser: **http://localhost:18083**

- **Username:** `admin`
- **Password:** `public`

### Konfigurasi Anonymous Access (Development)

EMQX sudah dikonfigurasi `EMQX_ALLOW_ANONYMOUS=true` di docker-compose, jadi device IoT & simulator bisa connect tanpa username/password.

### Verifikasi Koneksi MQTT

Gunakan EMQX Dashboard → **Websocket Client** untuk test publish/subscribe:

1. Buka **http://localhost:18083** → Login
2. Masuk ke menu **Diagnose → WebSocket Client**
3. Isi form:
   - Host: `localhost`
   - Port: `8083`
   - Client ID: `test-client-001`
   - Username & Password: *(kosongkan)*
4. Klik **Connect**
5. Subscribe ke topic: `hs/vitals/#`
6. Jalankan IoT Simulator untuk melihat data masuk

### Menjalankan IoT Simulator

```bash
# Dari root healthsync/
node tools/iot-simulator/simulate.js

# Atau jalankan skenario spesifik:
node tools/iot-simulator/simulate.js critical   # Alert kritis
node tools/iot-simulator/simulate.js normal     # Data normal
node tools/iot-simulator/simulate.js stress     # Stress test 100 device
```

Skenario yang tersedia: `normal`, `level1`, `level2`, `critical`, `recovery`, `stress`

### Topic MQTT HealthSync

| Topic | Deskripsi |
|-------|-----------|
| `hs/vitals/<patient_id>` | Data vital signs dari wearable |
| `hs/alerts/<patient_id>` | Alert threshold dari alert-service |
| `hs/vitals/+` | Wildcard — semua vitals semua pasien |

### Melihat Pesan Real-Time

Di EMQX Dashboard → **Diagnose → Topics**:
- Ketik `hs/#` untuk melihat semua topic aktif
- Klik topic untuk melihat subscriber

### Monitoring Koneksi

Dashboard → **Cluster** → **Nodes** → klik node untuk lihat:
- Jumlah koneksi aktif
- Rate publish/subscribe
- Subscriptions aktif

---

## MailHog — SMTP Email Catcher

### Akses Web UI
Buka browser: **http://localhost:8025**

MailHog menangkap semua email yang dikirim dari notification-service (OTP, notifikasi appointment, dll). Tidak ada email yang benar-benar dikirim ke internet — semua tertangkap di sini.

### Cara Kerja

Notification-service menggunakan konfigurasi SMTP:
```
SMTP_HOST=mailhog
SMTP_PORT=1025
```

Semua email yang dikirim service akan muncul otomatis di MailHog inbox.

### Test Pengiriman Email

Trigger notifikasi email dengan membuat appointment atau menggunakan API:

```bash
# Login dulu untuk dapat token
TOKEN=$(curl -s -X POST http://localhost:3001/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@healthsync.id","password":"Demo@12345"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

# Kirim notifikasi test
curl -X POST http://localhost:3009/v1/notifications \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "44ce64cc-14d5-4b80-9946-eb7a2b075c22",
    "type": "APPOINTMENT_REMINDER",
    "title": "Reminder Konsultasi",
    "message": "Konsultasi Anda dijadwalkan besok pukul 10:00",
    "channels": ["EMAIL", "IN_APP"]
  }'
```

Buka **http://localhost:8025** untuk melihat email yang masuk.

### Fitur MailHog

| Fitur | Cara Akses |
|-------|-----------|
| Inbox email | http://localhost:8025 |
| Detail email (HTML/text) | Klik email di inbox |
| Header email | Tab "MIME" di detail email |
| Download email (`.eml`) | Tombol "Download" di detail |
| Hapus semua email | Tombol "Delete All" di kanan atas |
| API MailHog | http://localhost:8025/api/v2/messages |

---

## Endpoint Verifikasi Cepat

Jalankan semua health check sekaligus:

```powershell
# PowerShell — cek semua service
@(3001,3002,3003,3004,3005,3006,3007,3008,3009,3010,4001,4002,4010) | ForEach-Object {
  try {
    $r = Invoke-WebRequest "http://localhost:$_/health" -UseBasicParsing -TimeoutSec 3
    Write-Host "✅ :$_  $($r.StatusCode)"
  } catch {
    Write-Host "❌ :$_  DOWN"
  }
}
```

---

## Login Web UI

Halaman login tersedia di: **http://localhost:3001**

Fitur:
- Form Login (masukkan email + password → dapat JWT token)
- Form Register (buat akun baru)
- Token JWT ditampilkan setelah login — klik untuk menyalin
- Link ke Swagger API Docs

### Akun Demo yang Sudah Ada

| Email | Password | Role |
|-------|----------|------|
| `demo@healthsync.id` | `Demo@12345` | PATIENT |

Atau daftar akun baru via halaman Register di http://localhost:3001

---

## Ringkasan URL Dev

| Service | URL | Keterangan |
|---------|-----|-----------|
| 🔐 Login Page | http://localhost:3001 | Form login + register |
| 📖 Swagger UI | http://localhost:4010/docs | API docs interaktif |
| 📡 EMQX Dashboard | http://localhost:18083 | MQTT broker (admin/public) |
| 📧 MailHog | http://localhost:8025 | Email catcher |
| 🗄️ PostgreSQL | localhost:5432 | DB (healthsync/healthsync_secret) |
| 🔴 Redis | localhost:6379 | Cache + sessions |
| 📨 Kafka | localhost:9092 | Event streaming |
| 🌐 MQTT | localhost:1883 | IoT device connection |
| 🌐 MQTT WS | localhost:8083 | MQTT over WebSocket |
