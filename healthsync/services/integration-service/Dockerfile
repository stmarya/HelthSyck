# syntax=docker/dockerfile:1
# Build context: monorepo root (healthsync/)
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init

# ── Install deps ──────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/pharmacy/package.json ./apps/pharmacy/
COPY packages/shared/package.json ./packages/shared/
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
RUN npm ci

# ── Build shared package ──────────────────────────────────────────────
FROM deps AS build-shared
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src/
RUN npm run build --workspace=packages/shared

# ── Build service ─────────────────────────────────────────────────────
FROM build-shared AS build-service
COPY services/integration-service/tsconfig.json ./services/integration-service/
COPY services/integration-service/src ./services/integration-service/src/
RUN npm run build --workspace=services/integration-service

# ── Production image ──────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache dumb-init
ENV NODE_ENV=production

# Copy hoisted root node_modules first, then overlay with service-level deps
# This ensures ALL deps (hoisted + non-hoisted) are in /app/node_modules
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/services/integration-service/node_modules ./node_modules
COPY --from=deps /app/packages/shared/package.json ./packages/shared/
COPY --from=build-shared /app/packages/shared/dist ./packages/shared/dist/
COPY --from=build-service /app/services/integration-service/dist ./dist/
COPY --from=deps /app/services/integration-service/package.json ./

EXPOSE 3010
USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
