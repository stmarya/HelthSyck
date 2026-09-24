# HealthSync Indonesia — Panduan Skrip

Tiga skrip utama untuk mengelola seluruh platform HealthSync dari satu perintah.

---

## 🚀 Quick Start (TL;DR)

```
# Windows (PowerShell)         │  Linux / Mac / WSL
# ─────────────────────────────│─────────────────────────────
# 1. Deploy pertama kali        │
.\scripts\deploy.ps1            │  ./scripts/deploy.sh

# 2. Start ulang (hari berikutnya)
.\scripts\start.ps1             │  ./scripts/start.sh

# 3. Jalankan semua tests
.\scripts\test.ps1              │  ./scripts/test.sh

# Atau via npm (cross-platform, otomatis deteksi OS)
npm run deploy
npm start
npm test
```

---

## 📁 File Skrip

| File | Platform | Fungsi |
|------|----------|--------|
| `scripts/deploy.ps1` | Windows | Setup pertama kali (install + build + docker + migrate) |
| `scripts/deploy.sh`  | Linux/Mac/WSL | Setup pertama kali |
| `scripts/start.ps1`  | Windows | Start/restart semua services |
| `scripts/start.sh`   | Linux/Mac/WSL | Start/restart semua services |
| `scripts/test.ps1`   | Windows | Jalankan semua test suite |
| `scripts/test.sh`    | Linux/Mac/WSL | Jalankan semua test suite |

---

## 1️⃣ deploy — Setup Pertama Kali

Jalankan **sekali saja** saat pertama kali clone/setup project.

```powershell
# Windows
.\scripts\deploy.ps1

# Linux / Mac / WSL
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

**Apa yang dilakukan (otomatis, berurutan):**
1. ✅ Cek prasyarat: Docker, Node.js ≥20, npm ≥10, Go
2. ✅ `npm ci` — install semua 12 workspace packages
3. ✅ Build `@healthsync/shared` package
4. ✅ `docker compose up --build` — build dan jalankan semua 22 containers
5. ✅ Tunggu infra ready (postgres, redis, kafka, emqx)
6. ✅ Tunggu migrasi database V001–V007 selesai
7. ✅ Verifikasi semua 12 service `/health` endpoint
8. ✅ Cetak ringkasan URL

**Estimasi waktu:** 5–15 menit (build pertama kali), 2–3 menit berikutnya.

---

## 2️⃣ start — Jalankan Ulang

Digunakan setiap hari / setelah restart komputer.

```powershell
# Windows
.\scripts\start.ps1              # start normal
.\scripts\start.ps1 -Build       # start + rebuild images
.\scripts\start.ps1 -Logs        # start + tampilkan logs
.\scripts\start.ps1 -Down        # matikan semua services

# Linux / Mac / WSL
./scripts/start.sh
./scripts/start.sh --build
./scripts/start.sh --logs
./scripts/start.sh --down

# npm (cross-platform)
npm start                        # start
npm run stop                     # matikan
npm run docker:logs              # lihat logs
```

---

## 3️⃣ test — Jalankan Tests

```powershell
# Windows
.\scripts\test.ps1                           # semua tests
.\scripts\test.ps1 -Unit                     # unit tests saja (Node + Go)
.\scripts\test.ps1 -Integration              # smoke tests live endpoints
.\scripts\test.ps1 -TypeCheck                # TypeScript type check saja
.\scripts\test.ps1 -Coverage                 # unit + coverage report
.\scripts\test.ps1 -Service consultation-service  # satu service saja

# Linux / Mac / WSL
./scripts/test.sh
./scripts/test.sh --unit
./scripts/test.sh --integration
./scripts/test.sh --typecheck
./scripts/test.sh --coverage
./scripts/test.sh --service consultation-service

# npm (cross-platform)
npm test                         # semua tests
npm run test:unit                # unit tests saja
npm run test:integration         # smoke tests
npm run test:coverage            # dengan coverage
npm run typecheck                # TypeScript saja
```

**Test suite yang dijalankan:**

| Bagian | Isi | Jumlah |
|--------|-----|--------|
| TypeScript | `tsc --noEmit` untuk command-center & admin | 2 checks |
| Node.js Unit | Jest untuk 10 services | 111 tests |
| Go Unit | `go test ./...` untuk iot-ingestion & alert-service | 10 tests |
| Integration | HTTP smoke test ke 15 live endpoints | 15 checks |

---

## 🌐 URL Setelah Running

| Aplikasi | URL | Credentials |
|----------|-----|-------------|
| Auth Web Login | http://localhost:3001 | demo@healthsync.id / Demo@12345 |
| Command Center | http://localhost:5173 | — |
| Admin Panel | http://localhost:5174 | admin role account |
| Swagger UI | http://localhost:4010/docs | — |
| MailHog | http://localhost:8025 | — |
| EMQX Dashboard | http://localhost:18083 | admin / public |

---

## 🔧 Prasyarat

- **Docker Desktop** ≥ 24 (Engine + Compose V2)
- **Node.js** ≥ 20.0.0
- **npm** ≥ 10.0.0
- **Go** ≥ 1.21

### Windows: Izin PowerShell

Jika muncul error *"execution of scripts is disabled"*, jalankan dulu:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## ❓ Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Docker tidak jalan | Buka Docker Desktop, tunggu "Engine running" |
| Port sudah terpakai | Cek `docker ps`, stop container lama dengan `npm run stop` |
| Migrasi gagal | `docker logs hs-migrate` untuk lihat error detail |
| Service tidak healthy | `docker logs hs-<nama-service>` untuk debug |
| Image lama | `.\scripts\start.ps1 -Build` / `./scripts/start.sh --build` |
| Reset total | `docker compose -f infra/docker/docker-compose.dev.yml down -v` (hapus data) |
