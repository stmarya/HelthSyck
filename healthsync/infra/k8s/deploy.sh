#!/usr/bin/env bash
# HealthSync Kubernetes Deploy Script
# Usage: ./deploy.sh [apply|delete|status]

set -euo pipefail

K8S_DIR="$(cd "$(dirname "$0")" && pwd)"
ACTION="${1:-apply}"
NAMESPACE="healthsync"

MANIFESTS=(
  "namespace.yaml"
  "secrets.yaml"
  "auth-service.yaml"
  "patient-service.yaml"
  "consultation-service.yaml"
  "prescription-service.yaml"
  "ambulance-service.yaml"
  "referral-service.yaml"
  "hospital-service.yaml"
  "pharmacy-service.yaml"
  "notification-service.yaml"
  "integration-service.yaml"
  "realtime-service.yaml"
  "command-center.yaml"
  "command-center-ingress.yaml"
  "iot-ingestion.yaml"
  "alert-service.yaml"
  "hpa.yaml"
  "ingress.yaml"
)

echo "==> HealthSync K8s $ACTION"

for manifest in "${MANIFESTS[@]}"; do
  file="$K8S_DIR/$manifest"
  if [[ -f "$file" ]]; then
    echo "  $ACTION: $manifest"
    kubectl "$ACTION" -f "$file"
  else
    echo "  [SKIP] $manifest not found"
  fi
done

if [[ "$ACTION" == "apply" ]]; then
  echo ""
  echo "==> Waiting for rollouts..."
  DEPLOYMENTS=(
    auth-service patient-service consultation-service prescription-service
    ambulance-service referral-service hospital-service pharmacy-service
    notification-service integration-service realtime-service command-center
    iot-ingestion alert-service
  )
  for dep in "${DEPLOYMENTS[@]}"; do
    kubectl rollout status deployment/"$dep" -n "$NAMESPACE" --timeout=120s || true
  done
  echo ""
  echo "==> Status"
  kubectl get pods -n "$NAMESPACE"
fi
