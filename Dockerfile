# ── Stage 1: install all deps + build the Vite client ────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: lean runtime image ───────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

# Copy deps (includes tsx, which is needed to run the TS server directly)
COPY --from=build /app/node_modules ./node_modules
# Copy built Vite client
COPY --from=build /app/dist ./dist
# Copy server source and shared types
COPY src/server ./src/server
COPY src/shared ./src/shared
COPY tsconfig.json ./
COPY package.json ./

ENV NODE_ENV=production
ENV PORT=8787

EXPOSE 8787

CMD ["node_modules/.bin/tsx", "src/server/main.ts"]
