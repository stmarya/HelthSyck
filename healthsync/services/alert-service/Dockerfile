# ── Build stage ──────────────────────────────
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy module files from service directory (context = monorepo root)
COPY services/alert-service/go.mod services/alert-service/go.sum* ./
RUN go mod download

COPY services/alert-service/ .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s" -o /bin/alert-service .

# ── Production stage ──────────────────────────
FROM alpine:3.19 AS production

RUN apk --no-cache add ca-certificates tzdata

RUN addgroup -S healthsync && adduser -S healthsync -G healthsync

COPY --from=builder /bin/alert-service /bin/alert-service

RUN chown healthsync:healthsync /bin/alert-service
USER healthsync

EXPOSE 4002

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4002/health || exit 1

ENTRYPOINT ["/bin/alert-service"]
