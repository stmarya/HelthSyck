# HealthSync Infrastructure

This directory contains all infrastructure-as-code for deploying HealthSync to production.

---

## Directory Structure

```
infra/
├── docker/
│   ├── docker-compose.dev.yml   # Local dev — all services + dependencies
│   └── .env.dev                 # Local dev environment variables
├── k8s/                         # Kubernetes manifests (production)
│   ├── namespace.yaml
│   ├── secrets.yaml             # ⚠️  Replace placeholder values before deploying
│   ├── *-service.yaml           # ConfigMap + Deployment + Service per service
│   ├── hpa.yaml                 # HorizontalPodAutoscaler (min:2, max:5, CPU:70%)
│   ├── ingress.yaml             # NGINX Ingress → all 10 services + TLS
│   └── deploy.sh                # Convenience deploy script
├── nginx/
│   ├── nginx.conf               # API Gateway: rate-limit, CORS, security headers
│   └── Dockerfile               # nginx:1.25-alpine image
└── terraform/                   # AWS infrastructure (EKS, RDS, ElastiCache)
    ├── main.tf                  # Provider, backend (S3 state)
    ├── variables.tf             # All configurable variables
    ├── vpc.tf                   # VPC, subnets (ap-southeast-3 / Jakarta)
    ├── eks.tf                   # EKS cluster + node group
    ├── rds.tf                   # PostgreSQL 15.4 Multi-AZ
    ├── elasticache.tf           # Redis 7.2 replication group
    └── outputs.tf               # Cluster endpoint, DB/Redis endpoints
```

---

## Local Development

```bash
# Start all services
cd infra/docker
docker compose -f docker-compose.dev.yml up -d

# View logs
docker compose -f docker-compose.dev.yml logs -f auth-service

# Stop all
docker compose -f docker-compose.dev.yml down
```

Services available locally:

| Service              | URL                          |
|----------------------|------------------------------|
| Auth                 | http://localhost:3001        |
| Patient              | http://localhost:3002        |
| Consultation         | http://localhost:3003        |
| Prescription         | http://localhost:3004        |
| Ambulance            | http://localhost:3005        |
| Referral             | http://localhost:3006        |
| Hospital             | http://localhost:3007        |
| Pharmacy             | http://localhost:3008        |
| Notification         | http://localhost:3009        |
| Integration          | http://localhost:3010        |
| IoT Ingestion        | http://localhost:4001        |
| Alert Service        | http://localhost:4002        |
| Swagger UI           | http://localhost:4010/docs   |
| EMQX Dashboard       | http://localhost:18083       |
| TimescaleDB          | localhost:5432               |
| Redis                | localhost:6379               |
| Kafka                | localhost:9092               |

---

## Kubernetes Deployment

### Prerequisites

- `kubectl` configured for your cluster
- Cluster has NGINX Ingress Controller installed
- `cert-manager` installed (for TLS)
- Secrets populated (see below)

### 1. Update Secrets

Edit [`k8s/secrets.yaml`](k8s/secrets.yaml) and replace all `REPLACE_WITH_*` placeholders:

```yaml
stringData:
  jwt-secret: "your-strong-random-32-char-secret"
  database-url: "postgresql://healthsync:PASSWORD@your-rds-endpoint:5432/healthsync"
  redis-url: "redis://:PASSWORD@your-elasticache-endpoint:6379"
  fcm-server-key: "your-firebase-server-key"
  satusehat-client-id: "your-satusehat-client-id"
  satusehat-client-secret: "your-satusehat-client-secret"
  bpjs-consumer-id: "your-bpjs-consumer-id"
  bpjs-consumer-secret: "your-bpjs-consumer-secret"
```

> **Never commit real secrets to git.** Use `kubectl create secret` or a secrets manager (AWS Secrets Manager, HashiCorp Vault) in production.

### 2. Deploy

```bash
cd infra/k8s
chmod +x deploy.sh
./deploy.sh apply      # Deploy all manifests
./deploy.sh delete     # Tear down all
./deploy.sh status     # Just show status
```

Or manually:

```bash
kubectl apply -f infra/k8s/namespace.yaml
kubectl apply -f infra/k8s/secrets.yaml
kubectl apply -f infra/k8s/
kubectl rollout status deployment/auth-service -n healthsync
```

### 3. Verify

```bash
kubectl get pods -n healthsync
kubectl get svc -n healthsync
kubectl get ingress -n healthsync
```

---

## Terraform (AWS)

### Prerequisites

- Terraform >= 1.5
- AWS CLI configured for `ap-southeast-3` (Jakarta)
- S3 bucket `healthsync-terraform-state` + DynamoDB table `healthsync-terraform-locks` created

### SSM Parameters Required

Create these in AWS SSM Parameter Store before running `terraform apply`:

```bash
aws ssm put-parameter --name /healthsync/db/username --value healthsync --type String --region ap-southeast-3
aws ssm put-parameter --name /healthsync/db/password --value YOUR_DB_PASSWORD --type SecureString --region ap-southeast-3
```

### Deploy

```bash
cd infra/terraform
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

### Outputs

After apply, Terraform outputs:

- `eks_cluster_endpoint` — EKS API server URL
- `eks_cluster_name` — cluster name for `aws eks update-kubeconfig`
- `rds_endpoint` — PostgreSQL connection host
- `redis_endpoint` — ElastiCache connection host
- `vpc_id`, `private_subnet_ids`, `public_subnet_ids`

```bash
# Configure kubectl after EKS is created
aws eks update-kubeconfig --name $(terraform output -raw eks_cluster_name) --region ap-southeast-3
```

---

## Architecture

```
Internet → Route53 → ALB → NGINX Ingress → Services (K8s ClusterIP)
                                             ↓
                                 PostgreSQL (RDS Multi-AZ)
                                 Redis (ElastiCache)
                                 Kafka (MSK)
                                 MQTT (EMQX)
```

Services run with:
- **2 replicas minimum** (HPA scales to 5 at 70% CPU)
- **Non-root containers** (`runAsUser: 1000`)
- **Health probes** on `GET /health`
- **Resource limits**: 500m CPU / 512Mi RAM
- **Graceful shutdown**: 30s termination grace period

---

## Security

- JWT secrets are never in ConfigMaps — always in Kubernetes Secrets referenced via `secretKeyRef`
- Database credentials read from SSM Parameter Store (Terraform) or K8s Secrets
- All inter-service traffic stays inside the cluster (ClusterIP services)
- TLS terminated at the Ingress (cert-manager + Let's Encrypt)
- Rate limiting: 100 req/s per IP (Nginx + NGINX Ingress annotations)
