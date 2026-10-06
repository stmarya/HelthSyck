#!/bin/sh
set -eu

json_escape() {
  printf '%s' "${1:-}" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\r/\\r/g; s/\n/\\n/g'
}

cat > /usr/share/nginx/html/runtime-config.js <<EOF
window.__HEALTHSYNC_CONFIG__ = {
  VITE_MAP_PROVIDER: "$(json_escape "${VITE_MAP_PROVIDER:-simulator}")",
  VITE_MAP_STYLE_URL: "$(json_escape "${VITE_MAP_STYLE_URL:-}")",
  VITE_MAP_ACCESS_TOKEN: "$(json_escape "${VITE_MAP_ACCESS_TOKEN:-}")",
  VITE_ROUTING_URL: "$(json_escape "${VITE_ROUTING_URL:-}")",
  VITE_LOCATION_STALE_AFTER_MS: "$(json_escape "${VITE_LOCATION_STALE_AFTER_MS:-15000}")",
  VITE_TURN_URL: "$(json_escape "${VITE_TURN_URL:-}")",
  VITE_TURN_USERNAME: "$(json_escape "${VITE_TURN_USERNAME:-}")",
  VITE_TURN_CREDENTIAL: "$(json_escape "${VITE_TURN_CREDENTIAL:-}")"
};
EOF
