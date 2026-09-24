# HealthSync Indonesia — Developer Standards Reference

> **Sumber:** Disintesis dari 23 dokumen resmi (BRD, PRD, SAD, API Spec, IoT Spec, Design System, Security Audit, Test Plan, SLA, DRP, Roadmap, dll.)
> **Versi:** 1.0 | 14 September 2026

---

## Daftar Isi

1. [Tech Stack Resmi](#1-tech-stack-resmi)
2. [Arsitektur & Service Map](#2-arsitektur--service-map)
3. [Coding Standards](#3-coding-standards)
4. [API Contract Standards](#4-api-contract-standards)
5. [Database Standards](#5-database-standards)
6. [IoT / MQTT Standards](#6-iot--mqtt-standards)
7. [Security Standards](#7-security-standards)
8. [Testing Standards & DoD](#8-testing-standards--dod)
9. [Design System Tokens](#9-design-system-tokens)
10. [SLA & Performance Targets](#10-sla--performance-targets)
11. [MVP Scope Boundary](#11-mvp-scope-boundary)
12. [Regulasi & Compliance Checklist](#12-regulasi--compliance-checklist)
13. [Disaster Recovery (RTO/RPO)](#13-disaster-recovery-rtorpo)
14. [Roadmap Overview](#14-roadmap-overview)

---

## 1. Tech Stack Resmi

| Layer              | Technology              | Versi         |
|--------------------|-------------------------|---------------|
| Mobile App         | Flutter + Dart          | SDK 3.16+     |
| Command Center     | React + TypeScript + Vite | React 18    |
| Admin Panel        | React + TypeScript + Vite | React 18    |
| Backend Services   | Node.js + TypeScript    | Node 20 LTS   |
| IoT Services       | Go                      | 1.21+         |
| Primary DB         | PostgreSQL               | 15            |
| Time-series DB     | TimescaleDB              | PG extension  |
| Cache              | Redis                   | 7             |
| Message Streaming  | Apache Kafka             | –             |
| MQTT Broker        | EMQX                    | 5             |
| Container          | Docker + Docker Compose  | –             |
| Orchestration      | Kubernetes (AWS EKS)    | –             |
| IaC                | Terraform               | –             |
| CI/CD              | GitHub Actions          | –             |

---

## 2. Arsitektur & Service Map

### Backend Services

| Service                | Port | Lang    | Fungsi                                           |
|------------------------|------|---------|--------------------------------------------------|
| `auth-service`         | 4000 | Node/TS | JWT, refresh token, multi-role login             |
| `patient-service`      | 4001 | Node/TS | Profil pasien, riwayat medis, symptom checker    |
| `consultation-service` | 4002 | Node/TS | Chat konsultasi, jadwal dokter                   |
| `prescription-service` | 4003 | Node/TS | e-Resep digital, validasi, status                |
| `pharmacy-service`     | 4004 | Node/TS | Stok apotek, fulfillment, delivery tracking      |
| `hospital-service`     | 4005 | Node/TS | Data RS, kapasitas bed, pencarian terdekat       |
| `ambulance-service`    | 4006 | Node/TS | Fleet management, dispatch, GPS tracking         |
| `referral-service`     | 4007 | Node/TS | Rujukan antar RS, status tracking                |
| `notification-service` | 4008 | Node/TS | Push, SMS, email, WebSocket events               |
| `integration-service`  | 4009 | Node/TS | SATUSEHAT FHIR export, third-party API           |
| `iot-ingestion`        | 4010 | Go      | MQTT consumer → Kafka → TimescaleDB              |
| `alert-service`        | 4011 | Go      | Threshold engine, 3-level alert escalation       |

### Infrastructure Ports

| Service           | Port           | Notes                    |
|-------------------|----------------|--------------------------|
| PostgreSQL        | 5432           | Primary DB               |
| Redis             | 6379           | Cache & session          |
| Kafka             | 9092           | Message broker           |
| EMQX MQTT         | 1883 / 8883    | IoT (8883 = TLS)         |
| EMQX Dashboard    | 18083          | admin / public           |
| Command Center    | 5173           | React dashboard          |
| Admin Panel       | 5174           | React admin              |
| Swagger UI        | 4010/docs      | API documentation        |
| MailHog           | 8025           | Email testing (dev only) |

### Auth Middleware Categories

- **Uses `@healthsync/shared` authenticate/requireRole:** `consultation`, `prescription`, `pharmacy`, `patient`
- **Inline JWT middleware:** `auth`, `ambulance`, `hospital`, `referral`, `notification`, `integration`
- **Go services:** `iot-ingestion`, `alert-service`

---

## 3. Coding Standards

### TypeScript (Node.js + React)
- **Strict mode ON** — `tsconfig.json` harus include `"strict": true`
- **Zero `any`** — gunakan proper typing atau `unknown` + type guard
- **ESLint + Prettier** — konfigurasi dari root workspace
- **No `console.log` untuk PII** — gunakan structured logger
- Import: absolute dengan path alias (`@/services/...`), bukan relative `../../../`

### Go (IoT services)
- `gofmt` dan `go vet` sebelum commit
- `golangci-lint` dengan konfigurasi project
- `staticcheck` untuk analisis statis

### Dart/Flutter
- `flutter analyze` harus pass (0 errors, 0 warnings)
- `flutter_lints` aktif di `analysis_options.yaml`

### Git & Commit Standards
```
Branch naming:
  feature/<ticket-id>-short-description
  fix/<ticket-id>-short-description
  chore/<ticket-id>-short-description

Commit (Conventional Commits):
  feat: add ambulance real-time tracking
  fix: correct JWT expiry validation
  chore: update dependencies
  docs: add API endpoint documentation
  test: add unit tests for alert service
```

**Rules:**
- No force-push ke `main` / `develop`
- PR wajib passing CI sebelum merge (lint + test + typecheck)
- Minimum 2 reviewer per PR
- Secrets: AWS Secrets Manager / Vault — JANGAN di `.env` yang di-commit

---

## 4. API Contract Standards

### Design Principles
- **RESTful** untuk CRUD operations
- **WebSocket** untuk real-time updates (vital signs, alerts)
- **gRPC** untuk internal service-to-service calls
- **URL versioning:** `/v1/`, `/v2/`
- **Rate limiting:** 100 req/min per user, 1000 req/min per service

### Standard Response Format

```typescript
// Success (list)
{
  "data": [...],
  "meta": {
    "timestamp": "2026-09-14T08:30:00Z",
    "page": 1,
    "limit": 20,
    "total": 150
  }
}

// Success (single object)
{
  "data": { ... },
  "meta": { "timestamp": "2026-09-14T08:30:00Z" }
}
```

> **PENTING:** Response shape ADALAH `{ data, meta }` — BUKAN `{ patients: [], referrals: [] }`.
> Gunakan helpers `ok()` dan `paginated()` dari `@healthsync/shared`.

### Error Response Format (RFC 7807 — WAJIB)

```json
{
  "type": "https://api.healthsync.id/errors/validation",
  "title": "Validation Error",
  "status": 422,
  "detail": "Field heart_rate must be between 30-250",
  "instance": "/v1/patients/xxx/vitals",
  "errors": [{ "field": "heart_rate", "message": "Value out of range" }]
}
```

Semua error HARUS menggunakan format RFC 7807. Jangan return `{ message: "error" }` plain.

### Authentication
- **Bearer JWT** di semua endpoint (header: `Authorization: Bearer <token>`)
- **Kecuali:** `/health`, `/v1/auth/login`, `/v1/auth/register`
- **Public endpoints** (optionalAuth — return data tanpa token, extra data jika ada token):
  - `GET /v1/hospitals*`
  - `GET /v1/pharmacies/nearby`
  - `GET /v1/ambulances/nearby`

---

## 5. Database Standards

### Aturan WAJIB

```typescript
// ✅ BENAR — parameterized query
const result = await pool.query(
  'SELECT * FROM patients WHERE id = $1 AND status = $2',
  [patientId, 'ACTIVE']
);

// ❌ SALAH — SQL injection vulnerability, DILARANG
const result = await pool.query(
  `SELECT * FROM patients WHERE id = '${patientId}'`
);
```

**SQL string interpolation = pelanggaran keamanan kritis. Tidak ada pengecualian.**

### Migrasi (Flyway)

| File          | Konten                                              |
|---------------|-----------------------------------------------------|
| V001__*.sql   | Extensions: TimescaleDB, UUID, PostGIS              |
| V002__*.sql   | users, roles, sessions                              |
| V003__*.sql   | patients, medical_history, devices                  |
| V004__*.sql   | doctors, hospitals, ambulances                      |
| V005__*.sql   | consultations, prescriptions, referrals             |
| V006__*.sql   | vital_signs (hypertable), alerts, alert_rules       |
| V007__*.sql   | pharmacies, pharmacy_orders, audit_logs             |

### Tabel Kritis

- `vital_signs` — TimescaleDB hypertable, partisi per waktu, JANGAN full table scan
- `audit_logs` — append-only, JANGAN update/delete, setiap akses data medis wajib tercatat
- `users.nik` — wajib tokenized/encrypted, JANGAN simpan plaintext NIK

---

## 6. IoT / MQTT Standards

### MQTT Topic Structure

```
healthsync/devices/{device_id}/vitals    QoS 1  ↑ Real-time vital signs
healthsync/devices/{device_id}/status   QoS 0  ↑ Online/offline/battery
healthsync/devices/{device_id}/config   QoS 1  ↓ Update sampling rate
healthsync/patients/{patient_id}/alerts QoS 2  ↓ Alert notifications
healthsync/patients/{patient_id}/commands QoS 2 ↓ Emergency commands
healthsync/system/heartbeat             QoS 0  Broker health
```

### Data Packet Format

```json
{
  "device_id": "GW6-XXXX-XXXX",
  "patient_id": "uuid",
  "timestamp": "ISO 8601",
  "vitals": {
    "heart_rate": 72,
    "spo2": 98,
    "systolic_bp": 120,
    "diastolic_bp": 80,
    "temperature": 36.5,
    "activity_level": "resting"
  },
  "battery_level": 85,
  "signal_strength": -45,
  "firmware_version": "2.1.3"
}
```

### Alert Thresholds

| Parameter    | Normal        | L1 Warning          | L2 Urgent           | L3 Critical     |
|--------------|---------------|---------------------|---------------------|-----------------|
| Heart Rate   | 60–100 bpm    | 50–59 / 101–120     | 40–49 / 121–150     | <40 / >150      |
| SpO2         | ≥95%          | 92–94%              | 88–91%              | <88%            |
| Systolic BP  | 90–139 mmHg   | 140–159 / 80–89     | 160–179 / <80       | ≥180 / <70      |
| Temperature  | 36.0–37.4°C   | 37.5–38.4°C         | 38.5–39.9°C         | ≥40 / <35°C     |

**L3 Critical = ambulance dispatch triggered (manual confirm MVP, auto Phase 2)**

---

## 7. Security Standards

### Enkripsi
- Data at rest: **AES-256**
- Data in transit: **TLS 1.3** (semua HTTP dan MQTT)
- PII fields (NIK, nomor HP, alamat): **field-level encryption**
- NIK (KTP): **tokenization** sebelum disimpan ke DB
- IoT device auth: **mTLS** (mutual TLS + device certificate)

### Access Control
- **JWT** short-lived access token (15 menit)
- **Refresh token** rotation (7 hari, single-use)
- **RBAC:** 5 roles — PATIENT, DOCTOR, HOSPITAL_STAFF, PHARMACIST, AMBULANCE_DRIVER
- **Audit log:** WAJIB untuk semua akses data medis

### Developer Security Rules

```
❌ JANGAN commit secrets ke git (gunakan .env.example, Vault, AWS Secrets Manager)
❌ JANGAN log PII atau data pasien dalam plaintext
❌ JANGAN SQL string interpolation (parameterized queries ONLY)
✅ WAJIB input validation: Zod (TypeScript) / go-validator (Go)
✅ WAJIB npm audit / go vuln check setiap sprint
✅ Secrets rotation setiap 90 hari
✅ Data breach notification < 3×24 jam ke otoritas
```

### PenTest Schedule
- Quarterly oleh pihak ketiga independen
- Exit criteria: 0 Critical, < 3 High (mitigated)

---

## 8. Testing Standards & DoD

### Test Coverage Targets

| Layer              | Tool               | Target       |
|--------------------|--------------------|--------------|
| Unit Tests         | Jest / Go test     | > 80%        |
| Integration Tests  | Supertest + Jest   | All endpoints |
| E2E Tests          | Playwright / Detox | Critical flows |
| Performance Tests  | k6 / Artillery     | Per SLA targets |
| Security Tests     | OWASP ZAP + manual | 0 Critical    |

### Definition of Done (DoD)

Setiap task HARUS memenuhi semua kriteria ini sebelum dianggap selesai:

- [ ] Code reviewed oleh minimal 2 engineer
- [ ] Unit test coverage > 80%
- [ ] Integration tests passing
- [ ] Deployed ke staging environment
- [ ] API documented di Swagger/OpenAPI
- [ ] No critical/high security findings
- [ ] Performance test passing (jika applicable)
- [ ] Product Owner acceptance

### Critical Test Cases

| ID                | Scenario                               | Expected Result                                |
|-------------------|----------------------------------------|------------------------------------------------|
| TC-EMERGENCY-001  | SpO2 < 88% selama 30 detik             | L3 alert < 3 detik, ambulans dispatched        |
| TC-REFERRAL-001   | Rujukan pasien antar RS                | Form terkirim, kapasitas RS berkurang          |
| TC-SEC-001        | Akses endpoint tanpa token             | 401 Unauthorized                               |
| TC-SEC-002        | SQL injection di input field           | 400 Bad Request, query tidak tereksekusi       |
| TC-PERF-001       | 10.000 concurrent users                | p95 < 200ms, 0 error                           |

### Exit Criteria (Sebelum Production)

- [ ] 0 Critical bugs
- [ ] < 5 Major bugs (dengan workaround)
- [ ] Performance targets terpenuhi
- [ ] Security PenTest: 0 Critical, < 3 High (mitigated)
- [ ] UAT sign-off dari semua stakeholder groups
- [ ] IoT data delivery rate > 99.9%
- [ ] Alert false positive rate < 15%

---

## 9. Design System Tokens

### Color Tokens

```css
--color-primary:      #1E88E5;  /* CTA utama, link, active state */
--color-success:      #43A047;  /* Status normal, konfirmasi */
--color-warning:      #FB8C00;  /* Alert Level 1 */
--color-danger:       #E53935;  /* Alert Level 2-3, error, darurat */
--color-critical:     #B71C1C;  /* Alert Level 3 critical */
--color-surface:      #F5F7FA;  /* Card background */
--color-text-primary: #212121;  /* Body text */
--color-text-muted:   #757575;  /* Secondary text */
```

### Typography

| Style         | Size  | Weight | Font              |
|---------------|-------|--------|-------------------|
| H1 App Title  | 24px  | 700    | Inter / SF Pro    |
| H2 Section    | 20px  | 600    | Inter / SF Pro    |
| H3 Card Title | 16px  | 600    | Inter / SF Pro    |
| Body          | 14px  | 400    | Inter / SF Pro    |
| Caption       | 12px  | 400    | Inter / SF Pro    |
| Vital Number  | 32px+ | 700    | Roboto Mono       |

### Accessibility (WAJIB)

- Contrast ratio minimum: **4.5:1** (WCAG 2.1 AA)
- Touch target minimum: **44×44px**
- Font scaling support: hingga **200%**
- Screen reader labels untuk semua vital signs
- Color-blind friendly: icon + color + text untuk alerts (tidak boleh warna saja)
- Dark mode support (Command Center priority)
- Respect `prefers-reduced-motion`

---

## 10. SLA & Performance Targets

### Availability SLA

| Service                            | Availability | Max Downtime/Bulan |
|------------------------------------|--------------|--------------------|
| Emergency services (alert, ambulance) | 99.99%    | 4.3 menit          |
| Core services (auth, patient, consultation) | 99.9% | 43.8 menit      |
| Supporting services (pharmacy, admin) | 99.5%    | 3.6 jam            |
| IoT Pipeline                       | 99.9%        | 43.8 menit         |

### Performance SLA

| Metric                                   | Target          |
|------------------------------------------|-----------------|
| API Response Time (p95)                  | < 200ms         |
| API Response Time (p99)                  | < 500ms         |
| IoT Data Latency (device → dashboard)    | < 2 detik       |
| Emergency Alert Delivery (end-to-end)    | < 3 detik       |
| Concurrent Users                         | 10.000          |
| Concurrent IoT Devices                   | 50.000          |
| DB Write Throughput (vital signs)        | 1.000 writes/sec |

### Deployment Pipeline

| Stage      | Trigger                | Actions                                           |
|------------|------------------------|---------------------------------------------------|
| Dev        | Push ke feature branch | Lint, unit test, typecheck                        |
| Staging    | Merge ke develop       | Full CI (unit + integration + security scan)      |
| Production | Manual approval        | Blue-green deploy, smoke test, rollback-ready     |

---

## 11. MVP Scope Boundary

### ✅ IN SCOPE (MVP v1.0)

- Multi-role authentication (5 roles)
- Symptom checker (rule-based decision tree, **bukan AI/ML**)
- Konsultasi chat text-based
- e-Prescription + apotek fulfillment + delivery tracking
- Smartwatch pairing (Samsung Galaxy Watch — 1 brand saja)
- Alert system (threshold-based, 3-level eskalasi)
- Command Center dashboard (read + basic action)
- Rujukan digital (form + status tracking)
- Ambulance dispatch (**manual assign** oleh Command Center)
- RS recommendation (distance + kapasitas)
- Notifikasi Push + SMS (critical)

### ❌ OUT OF SCOPE (Phase 2+)

- AI/ML untuk diagnosis atau predictive analytics
- Video consultation
- Integrasi BPJS Kesehatan
- SATUSEHAT full integration (MVP: manual FHIR export only)
- Multi-smartwatch support
- **Auto-dispatch** ambulance tanpa konfirmasi manusia
- Payment gateway terintegrasi
- Multi-language support
- White-label untuk RS partner

---

## 12. Regulasi & Compliance Checklist

### UU PDP No. 27/2022

- [ ] Penunjukan Data Protection Officer (DPO)
- [ ] Data Protection Impact Assessment (DPIA) selesai
- [ ] Consent management system terimplementasi (granular per kategori)
- [ ] Prosedur data breach notification (< 3×24 jam)
- [ ] Privacy by design dalam arsitektur
- [ ] Data subject rights mechanism (access, delete, port)
- [ ] Record of Processing Activities (RoPA)

### SATUSEHAT (Kemenkes)

- [ ] Registrasi sebagai Penyelenggara Sistem Elektronik Kesehatan
- [ ] Implementasi standar FHIR R4
- [ ] Mapping data model ke SATUSEHAT resource profiles
- [ ] Uji integrasi dengan SATUSEHAT sandbox
- [ ] Sertifikasi interoperabilitas dari Kemenkes

### PSE Kominfo

- [ ] Pendaftaran PSE Lingkup Privat
- [ ] Server/data center di Indonesia (**data residency wajib**)
- [ ] Laporan berkala ke Kominfo

### Permenkes RME

- [ ] Standar minimum data rekam medis terpenuhi
- [ ] Retensi data minimum 10 tahun
- [ ] Audit trail lengkap untuk semua akses
- [ ] Digital signature untuk validasi dokumen medis

### Retensi Data

| Jenis Data                     | Retensi      |
|--------------------------------|--------------|
| Rekam medis (konsultasi, resep) | Min 10 tahun |
| Vital signs (IoT)              | 5 tahun      |
| Log transaksi                  | 5 tahun      |
| Audit trail                    | 7 tahun      |
| Data akun (pasca hapus akun)   | 30 hari      |

---

## 13. Disaster Recovery (RTO/RPO)

| Service                  | RTO (Recovery Time) | RPO (Max Data Loss)   |
|--------------------------|---------------------|-----------------------|
| Emergency services       | < 5 menit           | 0 (sync replication)  |
| Core API services        | < 15 menit          | < 1 menit             |
| Database (PostgreSQL)    | < 30 menit          | < 5 menit             |
| IoT Pipeline             | < 10 menit          | < 30 detik            |

### Emergency SOP (Kegagalan Sistem yang Mempengaruhi Emergency Response)

```
T+0  (SEGERA)     → Aktifkan fallback manual (telepon RS, dispatch via radio)
T+5  menit        → Informasikan semua Command Center RS terdampak
T+15 menit        → Engineering team identifikasi root cause
T+30 menit        → Implementasi fix atau failover
T+1  jam          → Post-incident review dimulai
T+24 jam          → Incident report lengkap + corrective actions
```

### Backup Schedule

| Data             | Frekuensi   | Retensi  | Storage             |
|------------------|-------------|----------|---------------------|
| PostgreSQL full  | Daily       | 30 hari  | AWS S3 (encrypted)  |
| PostgreSQL WAL   | Continuous  | 7 hari   | AWS S3              |
| TimescaleDB      | Daily       | 90 hari  | AWS S3              |
| Redis RDB        | Hourly      | 24 jam   | AWS ElastiCache     |

---

## 14. Roadmap Overview

| Phase      | Periode      | Fokus Utama                              | Target                         |
|------------|--------------|------------------------------------------|--------------------------------|
| Phase 1 MVP | Bulan 1–9   | Core platform, IoT, Emergency Response   | 2 RS pilot, 500 pasien aktif   |
| Phase 2    | Bulan 10–15  | AI/ML, Video konsultasi, BPJS, SATUSEHAT | 10 RS, 5.000 pasien            |
| Phase 3    | Bulan 16–24  | Skala nasional, B2B API, Research        | 100 RS, 50.000 pasien          |
| Backlog    | Unscheduled  | Insurance, Mental Health, Multi-language | TBD post-launch                |

---

## Quick Reference

### Demo Account
```
Email:    demo@healthsync.id
Password: Demo@12345
Role:     PATIENT
```

### Dev URLs
```
Auth service login:  http://localhost:4000
Command Center:      http://localhost:5173
Admin Panel:         http://localhost:5174
Swagger UI:          http://localhost:4010/docs
EMQX Dashboard:      http://localhost:18083  (admin/public)
MailHog:             http://localhost:8025
```

### One-Command Start
```bash
npm run deploy    # First-time setup
npm run start     # Start all containers
npm run test      # Full test suite
npm run stop      # Stop all containers
```

---

*Dokumen ini adalah sintesis dari 23 dokumen resmi HealthSync Indonesia. Untuk detail lengkap, rujuk dokumen sumber di `HealthSync_Docs/`.*
