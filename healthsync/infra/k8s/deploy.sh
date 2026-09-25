#!/usr/bin/env bash
# HealthSync Kubernetes Deploy Script
# Usage: ./deploy.sh [apply|delete|status]
set -Eeuo pipefail

K8S_DIR="$(cd "$(dirname "$0")" && pwd)"
ACTION="${1:-apply}"
NAMESPACE="healthsync"
MANIFESTS=(
  namespace.yaml secrets.yaml auth-service.yaml patient-service.yaml
  consultation-service.yaml prescription-service.yaml ambulance-service.yaml
  referral-service.yaml hospital-service.yaml pharmacy-service.yaml
  notification-service.yaml integration-service.yaml iot-ingestion.yaml
  alert-service.yaml hpa.yaml ingress.yaml
)
DEPLOYMENTS=(
  auth-service patient-service consultation-service prescription-service
  ambulance-service referral-service hospital-service pharmacy-service
  notification-service integration-service iot-ingestion alert-service
)

usage() { echo "Usage: $0 [apply|delete|status]" >&2; exit 2; }
[[ "$ACTION" =~ ^(apply|delete|status)$ ]] || usage

if [[ "$ACTION" == status ]]; then
  kubectl get deployments,pods,services -n "$NAMESPACE"
  exit 0
fi

echo "==> HealthSync K8s $ACTION"
for manifest in "${MANIFESTS[@]}"; do
  file="$K8S_DIR/$manifest"
  [[ -f "$file" ]] || { echo "Manifest not found: $file" >&2; exit 1; }
  echo "  $ACTION: $manifest"
  kubectl "$ACTION" -f "$file" --ignore-not-found
 done

if [[ "$ACTION" == apply ]]; then
  echo "==> Waiting for rollouts..."
  for dep in "${DEPLOYMENTS[@]}"; do
    if ! kubectl rollout status "deployment/$dep" -n "$NAMESPACE" --timeout=120s; then
      echo "Rollout failed for $dep; attempting rollback of the deployment." >&2
      kubectl rollout undo "deployment/$dep" -n "$NAMESPACE" || true
      exit 1
    fi
  done
  echo "==> Status"
  kubectl get deployments,pods,services -n "$NAMESPACE"
fi
