# HealthSync Indonesia 🏥

Platform kesehatan terpadu untuk Indonesia — menghubungkan pasien, tenaga medis, rumah sakit, apotek, dan layanan darurat dalam satu ekosistem digital.

---

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Service Ports](#service-ports)
- [Architecture Overview](#architecture-overview)
- [Running Individual Apps](#running-individual-apps)
- [Contributing](#contributing)
- [Documentation](#documentation)

---

## Overview

HealthSync Indonesia is a microservices-based healthcare platform consisting of:

- **12 backend services** (Node.js/TypeScript + Go)
- **3 front-end applications** (Flutter mobile, React command-center, React admin)
- **Infrastructure** (Docker Compose for local dev, Kubernetes manifests, Terraform for AWS)

---

## Prerequisites

| Tool | Minimum Version |
|------|----------------|
| Node.js | 20.x LTS |
| npm | 9.x |
| Go | 1.21 |
| Flutter | 3.16 |
| Docker | 24.x |
| Docker Compose | v2.x |
| kubectl | 1.28 (optional, for K8s) |
| Terraform | 1.6 (optional, for infra) |

---

## Quick Start

### 1. Clone & bootstrap

```bash
git clone https://github.com/healthsync-indonesia/healthsync.git
cd healthsync
```

### 2. Copy environment files

```bash
cp infra/docker/.env.dev.example infra/docker/.env.dev
# Change JWT_SECRET and database password before sharing the environment.

# Copy env files for each service
for svc in auth patient consultation prescription ambulance referral hospital pharmacy notification integration; do
  cp services/${svc}-service/.env.example services/${svc}-service/.env
done

for svc in iot-ingestion alert-service; do
  cp services/${svc}/.env.example services/${svc}/.env
done
```

### 3. Start all infrastructure + services

```bash
docker compose -f infra/docker/docker-compose.dev.yml \
  --env-file infra/docker/.env.dev up --build
```

### 4. Verify services are healthy

```bash
# Check a service health endpoint
curl http://localhost:3001/health   # auth-service
curl http://localhost:4001/health   # iot-ingestion
```

---

## Service Ports

| Service | Language | Port |
|---------|----------|------|
| auth-service | Node.js/TS | 3001 |
| patient-service | Node.js/TS | 3002 |
| consultation-service | Node.js/TS | 3003 |
| prescription-service | Node.js/TS | 3004 |
| ambulance-service | Node.js/TS | 3005 |
| referral-service | Node.js/TS | 3006 |
| hospital-service | Node.js/TS | 3007 |
| pharmacy-service | Node.js/TS | 3008 |
| notification-service | Node.js/TS | 3009 |
| integration-service | Node.js/TS | 3010 |
| iot-ingestion | Go | 4001 |
| alert-service | Go | 4002 |

### Infrastructure Ports

| Service | Port |
|---------|------|
| PostgreSQL | 5432 |
| Redis | 6379 |
| EMQX MQTT | 1883 |
| EMQX WebSocket | 8083 |
| EMQX Dashboard | 18083 |
| Kafka | 9092 |
| Zookeeper | 2181 |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Client Layer                       │
│  Flutter Mobile  │  Command Center  │  Admin Panel   │
└────────┬─────────┴────────┬─────────┴────────┬──────┘
         │                  │                  │
         ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────┐
│                  API Gateway / Load Balancer          │
└───────────────────────┬─────────────────────────────┘
                        │
        ┌───────────────┼──────────────────┐
        ▼               ▼                  ▼
┌──────────────┐ ┌──────────────┐  ┌──────────────┐
│ auth-service │ │patient-svc   │  │consult-svc   │
│ (JWT/OAuth)  │ │              │  │              │
└──────────────┘ └──────────────┘  └──────────────┘
        │               │                  │
        ▼               ▼                  ▼
┌─────────────────────────────────────────────────────┐
│              Message Bus (Kafka)                     │
└─────────────────────────────────────────────────────┘
        │               │
        ▼               ▼
┌──────────────┐  ┌──────────────┐
│iot-ingestion │  │ alert-service│
│(MQTT→Kafka)  │  │(thresholds)  │
└──────────────┘  └──────────────┘
        │
        ▼
┌──────────────────────────────┐
│  IoT Devices / Wearables     │
└──────────────────────────────┘
```

---

## Running Individual Apps

### Mobile (Flutter)

```bash
cd apps/mobile
flutter pub get
flutter run
```

### Command Center (React + Vite)

```bash
cd apps/command-center
npm install
npm run dev   # http://localhost:5173
```

### Admin Panel (React + Vite)

```bash
cd apps/admin
npm install
npm run dev   # http://localhost:5174
```

### Single Node.js Service

```bash
cd services/auth-service
npm install
npm run dev
```

### Single Go Service

```bash
cd services/iot-ingestion
go mod download
go run main.go
```

---

## Contributing

### Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feat/<scope>` | `feat/patient-vitals-api` |
| Bug Fix | `fix/<scope>` | `fix/jwt-expiry-validation` |
| Chore | `chore/<scope>` | `chore/update-dependencies` |

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(auth): add refresh token rotation
fix(patient): handle null date-of-birth
chore(deps): upgrade express to 4.19
```

### Pull Request Checklist

- [ ] Tests pass (`npm test` / `go test ./...`)
- [ ] Lint passes (`npm run lint` / `go vet ./...`)
- [ ] Health endpoint still responds 200
- [ ] `.env.example` updated if new env vars added
- [ ] Documentation updated if API changed

---

## Documentation

Full technical documentation lives in [`docs/README.md`](docs/README.md).

---

*HealthSync Indonesia — Kesehatan untuk Semua*
