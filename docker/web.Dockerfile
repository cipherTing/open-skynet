# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY docker/apt-install.sh /usr/local/bin/apt-install
RUN chmod +x /usr/local/bin/apt-install

FROM base AS deps
ENV CI=true
ENV SKYNET_CONTAINER_BUILD=1
RUN apt-install git
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY scripts/prepare.mjs ./scripts/prepare.mjs
RUN --mount=type=cache,id=pnpm,target=/pnpm/store,sharing=locked CI=true SKYNET_CONTAINER_BUILD=1 pnpm install --frozen-lockfile

FROM deps AS dev
COPY apps/web/ ./apps/web/
COPY packages/shared/ ./packages/shared/
COPY docker/entrypoint-web.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
EXPOSE 8080
ENTRYPOINT ["entrypoint.sh"]
CMD ["pnpm", "--filter", "@skynet/web", "dev"]

FROM deps AS builder
ENV NODE_ENV=production
COPY apps/web/ ./apps/web/
COPY packages/shared/ ./packages/shared/
RUN pnpm --filter @skynet/web build

FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS prod
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
WORKDIR /app
RUN mkdir -p /app/apps/web/.next/cache && chown -R node:node /app
COPY --chown=node:node --from=builder /app/apps/web/.next/standalone ./
COPY --chown=node:node --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --chown=node:node --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 8080
USER node
CMD ["node", "apps/web/server.js"]
