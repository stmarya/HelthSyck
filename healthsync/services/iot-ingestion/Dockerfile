# ── Build stage ──────────────────────────────
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy module files from service directory (context = monorepo root)
COPY services/iot-ingestion/go.mod services/iot-ingestion/go.sum* ./
RUN go mod download

COPY services/iot-ingestion/ .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s" -o /bin/iot-ingestion .

# ── Production stage ──────────────────────────
FROM alpine:3.19 AS production

RUN apk --no-cache add ca-certificates tzdata

# Create non-root user
RUN addgroup -S healthsync && adduser -S healthsync -G healthsync

COPY --from=builder /bin/iot-ingestion /bin/iot-ingestion

RUN chown healthsync:healthsync /bin/iot-ingestion
USER healthsync

EXPOSE 4001

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4001/health || exit 1

ENTRYPOINT ["/bin/iot-ingestion"]
