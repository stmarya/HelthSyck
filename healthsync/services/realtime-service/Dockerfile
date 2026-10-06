FROM node:20-alpine AS build
WORKDIR /app
COPY services/realtime-service/package*.json ./
RUN npm install
COPY services/realtime-service/tsconfig.json ./
COPY services/realtime-service/src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY services/realtime-service/package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3011
CMD ["node", "dist/index.js"]
