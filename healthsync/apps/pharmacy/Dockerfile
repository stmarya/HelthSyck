FROM node:20-slim AS dev

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/pharmacy/package.json ./apps/pharmacy/
COPY services/auth-service/package.json ./services/auth-service/
COPY services/prescription-service/package.json ./services/prescription-service/
COPY services/pharmacy-service/package.json ./services/pharmacy-service/

RUN rm -f package-lock.json && npm install --no-audit --no-fund

COPY apps/pharmacy ./apps/pharmacy
COPY packages/shared ./packages/shared

WORKDIR /app/apps/pharmacy
EXPOSE 5175
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "5175"]