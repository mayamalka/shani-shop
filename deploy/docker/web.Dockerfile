# syntax=docker/dockerfile:1.7
# Web image: the static React build served by unprivileged nginx (port 8080). Build from the repo root:
#   docker buildx build -f deploy/docker/web.Dockerfile --platform linux/arm64 -t shani-web .

# 1) build the site – output is plain HTML/JS/CSS, so build natively on the CI machine
FROM --platform=$BUILDPLATFORM node:26-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm npm ci -w @shani/web -w @shani/shared --include-workspace-root --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @shani/web

# 2) serve
FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY deploy/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
