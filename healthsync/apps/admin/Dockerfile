# ── Admin Panel — Vite dev server ─────────────────────────────────────────────
# Use Debian-based image (glibc) so rollup/esbuild native binaries resolve
# without needing the musl variants that Windows-generated lock files omit.
FROM node:20-slim AS dev

WORKDIR /app

# Copy root workspace manifests (node_modules excluded via .dockerignore)
COPY package.json package-lock.json ./
COPY apps/pharmacy/package.json ./apps/pharmacy/
COPY packages/shared/package.json ./packages/shared/
COPY apps/command-center/package.json ./apps/command-center/
COPY apps/admin/package.json ./apps/admin/
COPY services/auth-service/package.json ./services/auth-service/
COPY services/patient-service/package.json ./services/patient-service/
COPY services/consultation-service/package.json ./services/consultation-service/
COPY services/prescription-service/package.json ./services/prescription-service/
COPY services/ambulance-service/package.json ./services/ambulance-service/
COPY services/referral-service/package.json ./services/referral-service/
COPY services/hospital-service/package.json ./services/hospital-service/
COPY services/pharmacy-service/package.json ./services/pharmacy-service/
COPY services/notification-service/package.json ./services/notification-service/
COPY services/integration-service/package.json ./services/integration-service/

# Fresh install at workspace root
RUN rm -f package-lock.json && npm install --no-audit --no-fund
RUN npx update-browserslist-db@latest

# Copy application source
COPY apps/admin ./apps/admin
COPY packages/shared ./packages/shared

WORKDIR /app/apps/admin

EXPOSE 5174

CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "5174"]
