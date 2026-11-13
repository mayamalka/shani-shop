# syntax=docker/dockerfile:1.7
# API image (Fastify). Build from the repo root:
#   docker buildx build -f deploy/docker/api.Dockerfile --platform linux/arm64 -t shani-api .
# Commands inside the image (WORKDIR /app):
#   node apps/api/dist/index.js          – server (default)
#   node apps/api/dist/migrate.js        – apply migrations and exit
#   node apps/api/dist/purge.js          – one photo-purge run and exit
#   node apps/api/dist/seed.js           – starter data (first deploy)
#   node apps/api/dist/create-admin.js --email you@example.com

ARG NODE_IMAGE=node:26-bookworm-slim

# 1) bundle the TypeScript – platform independent, so it runs natively on the CI machine
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm npm ci -w @shani/api -w @shani/shared --include-workspace-root --ignore-scripts --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @shani/api

# 2) production dependencies for the target platform (sharp/argon2 native binaries)
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm npm ci -w @shani/api --omit=dev --no-audit --no-fund

# 3) runtime
FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3001 \
    SKIP_DOTENV=1
WORKDIR /app
COPY --from=deps --chown=root:root /app/node_modules ./node_modules
COPY --chown=root:root apps/api/package.json apps/api/package.json
COPY --chown=root:root apps/api/drizzle apps/api/drizzle
COPY --chown=root:root apps/api/data apps/api/data
COPY --from=build --chown=root:root /app/apps/api/dist apps/api/dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s CMD ["node", "-e", "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--enable-source-maps", "apps/api/dist/index.js"]
