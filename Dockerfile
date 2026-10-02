# Imagen única para los servicios `web` y `worker` (ver docker-compose.yml).

FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
# Prisma necesita OpenSSL 3 (binaryTargets = debian-openssl-3.0.x).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm prisma generate \
  && pnpm build \
  && pnpm build:worker \
  && pnpm prune --prod \
  && pnpm prisma generate

FROM base AS runtime
ENV NODE_ENV=production PORT=3000
# El worker y `prisma migrate deploy` necesitan node_modules completo, por eso no se usa
# `output: 'standalone'` de Next.
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/next.config.mjs ./
USER node
EXPOSE 3000
# El servicio `web` aplica las migraciones pendientes antes de arrancar.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node_modules/.bin/next start -p ${PORT}"]
