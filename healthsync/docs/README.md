# HealthSync Indonesia — Technical Documentation

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Services Reference](#services-reference)
3. [API Conventions](#api-conventions)
4. [Authentication & Authorization](#authentication--authorization)
5. [Database & API Contract](DATABASE.md)
6. [Event Bus (Kafka Topics)](#event-bus-kafka-topics)
7. [IoT & MQTT](#iot--mqtt)
8. [Environment Variables](#environment-variables)
9. [Deployment](#deployment)
10. [Security Considerations](#security-considerations)

---

## System Architecture

HealthSync follows a **microservices architecture** with:

- **Synchronous communication**: REST over HTTPS (inter-service via internal DNS)
- **Asynchronous communication**: Apache Kafka for events
- **IoT pipeline**: EMQX (MQTT broker) → `iot-ingestion` → Kafka → `alert-service`
- **Auth**: JWT (short-lived access token + refresh token rotation)
- **Data stores**: one PostgreSQL schema currently shared by the services (logical ownership is documented in [DATABASE.md](DATABASE.md)), Redis for cache/sessions

---

## Services Reference

| Service | Responsibility |
|---------|---------------|
| `auth-service` | User registration, login, JWT issuance, refresh tokens, RBAC |
| `patient-service` | Patient profiles, medical history, vital records |
| `consultation-service` | Telemedicine sessions, scheduling, doctor–patient pairing |
| `prescription-service` | Digital prescriptions, e-resep integration |
| `ambulance-service` | Real-time ambulance tracking, dispatch, ETA calculation |
| `referral-service` | Inter-hospital referrals, bed availability queries |
| `hospital-service` | Hospital registry, department catalog, capacity management |
| `pharmacy-service` | Inventory, prescription fulfillment, drug interaction checks |
| `notification-service` | Push notifications, SMS (via Twilio/Vonage), email |
| `integration-service` | SATUSEHAT (Kemenkes) & BPJS integration adapters |
| `iot-ingestion` | MQTT consumer, IoT payload validation, Kafka producer |
| `alert-service` | Vital-sign threshold evaluation, alert fanout |

---

## API Conventions

### Base URL

```
https://api.healthsync.id/v1/<service>
```

### Request / Response Format

All endpoints consume and produce `application/json`.

### Success Response

```json
{
  "data": { ... },
  "meta": {
    "timestamp": "2026-09-15T07:23:14Z",
    "requestId": "uuid-v4"
  }
}
```

### Error Response (RFC 7807 — Problem Details)

```json
{
  "type": "https://errors.healthsync.id/validation-error",
  "title": "Validation Error",
  "status": 422,
  "detail": "Field 'email' must be a valid email address.",
  "instance": "/v1/auth/register",
  "requestId": "uuid-v4"
}
```

### Pagination

Query params: `?page=1&limit=20`

Response envelope:

```json
{
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

---

## Authentication & Authorization

### Flow

1. `POST /v1/auth/login` → returns `{ accessToken, refreshToken }`
2. `accessToken` — HS256 JWT, 15-minute TTL
3. `refreshToken` — opaque token stored in Redis, 7-day TTL
4. On expiry: `POST /v1/auth/refresh` with `{ refreshToken }` → new pair (rotation)

### JWT Payload

```json
{
  "sub": "user-uuid",
  "role": "DOCTOR | PATIENT | ADMIN | PARAMEDIC",
  "iat": 1694000000,
  "exp": 1694000900
}
```

### RBAC Roles

| Role | Description |
|------|------------|
| `PATIENT` | Access own records only |
| `DOCTOR` | Access assigned patients, write consultations/prescriptions |
| `PARAMEDIC` | Ambulance dispatch, vitals update |
| `PHARMACIST` | Prescription fulfillment |
| `ADMIN` | Full platform access |
| `SYSTEM` | Service-to-service internal calls |

---

## Database & API Contract

The canonical FE ↔ BE ↔ DB contract is maintained in [`DATABASE.md`](DATABASE.md). It is generated from and reviewed against the migrations in [`infra/db/migrations`](../infra/db/migrations).

Key rules:

- DB-backed response fields currently use `snake_case`; request bodies use the service validators' `camelCase` fields.
- Roles are `PATIENT`, `DOCTOR`, `COMMAND_CENTER`, `PHARMACIST`, `AMBULANCE_DRIVER`, and `ADMIN`.
- Consultation status is `PENDING`, `ACCEPTED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, or `EXPIRED`; there is no persisted `scheduled_at` field.
- Prescription status is `ISSUED`, `SENT_TO_PHARMACY`, `CONFIRMED`, `PREPARING`, `READY`, `DELIVERING`, `DELIVERED`, or `CANCELLED`.
- Referral status is `DRAFT`, `SENT`, `ACCEPTED`, `REJECTED`, `IN_TRANSIT`, `ARRIVED`, or `CANCELLED`; urgency is `NORMAL`, `URGENT`, or `CRITICAL`.

## Event Bus (Kafka Topics)

The active Kafka pipeline is IoT/alert processing (`KAFKA_TOPIC_VITALS` and `KAFKA_TOPIC_ALERTS`). The former `hs.*` application-event table was aspirational and is not currently emitted by the Node services; it is therefore not a contract for FE or BE integration.

## IoT & MQTT

### MQTT Topic Structure

```
hs/devices/<deviceId>/vitals
hs/devices/<deviceId>/status
hs/alerts/<patientId>
```

### Vital Payload Schema

```json
{
  "deviceId": "string",
  "patientId": "uuid",
  "timestamp": "ISO8601",
  "heartRate": 75,
  "spo2": 98.5,
  "temperature": 36.7,
  "systolic": 120,
  "diastolic": 80
}
```

### Alert Thresholds

| Vital | Warning | Critical |
|-------|---------|---------|
| Heart Rate | <50 or >100 bpm | <40 or >130 bpm |
| SpO₂ | <95% | <90% |
| Temperature | >37.5°C | >39°C |

---

## Environment Variables

Common variables across all services:

| Variable | Description |
|----------|------------|
| `PORT` | HTTP listen port |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | HS256 signing secret |
| `REDIS_URL` | Redis connection URL |
| `CORS_ORIGINS` | Comma-separated allowlist for Admin and Command Center origins |
| `KAFKA_BROKERS` | Comma-separated broker list |
| `NODE_ENV` | `development` \| `production` \| `test` |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` |

---

## Deployment

### Local (Docker Compose)

```bash
docker compose -f infra/docker/docker-compose.dev.yml up --build
```

### Kubernetes

```bash
cp infra/k8s/secrets.yaml /tmp/healthsync-secrets.yaml
# Isi /tmp/healthsync-secrets.yaml melalui secret manager.
kubectl apply -f /tmp/healthsync-secrets.yaml
./infra/k8s/deploy.sh apply
```

The deployment script refuses to apply the repository template while any
`REPLACE_WITH_*` secret placeholder remains. Run the database migration job and
verify every rollout before exposing the ingress.

### AWS (Terraform)

```bash
cd infra/terraform
terraform init
terraform plan
terraform apply
```

---

## Security Considerations

1. **Parameterized queries only** — no string interpolation in SQL.
2. **Secrets via environment** — never commit `.env` files; use AWS Secrets Manager in production.
3. **HTTPS everywhere** — TLS termination at the load balancer.
4. **Rate limiting** — 100 req/min per IP at the API gateway.
5. **Input validation** — Zod schemas validate all incoming request bodies.
6. **Audit logging** — all mutations logged with `userId`, `action`, `resource`, `timestamp`.
7. **Token rotation** — refresh tokens are single-use; revocation on logout.
8. **Container security** — non-root user in all Dockerfiles, read-only filesystem where possible.

---

*Last updated: 2026-09-15 | HealthSync Indonesia Engineering Team*
