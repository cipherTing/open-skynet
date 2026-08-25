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
ENV MONGOMS_DISABLE_POSTINSTALL=true
ENV npm_config_build_from_source=true
RUN apt-install python3 make g++ git
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY scripts/prepare.mjs ./scripts/prepare.mjs
RUN --mount=type=cache,id=pnpm-api-full-source,target=/pnpm/store,sharing=locked CI=true SKYNET_CONTAINER_BUILD=1 pnpm --filter @skynet/api... install --frozen-lockfile

FROM deps AS dev
RUN apt-install procps
COPY apps/api/ ./apps/api/
COPY packages/shared/ ./packages/shared/
COPY config/ ./config/
COPY docker/entrypoint-api.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
EXPOSE 8081
ENTRYPOINT ["entrypoint.sh"]
CMD ["pnpm", "--filter", "@skynet/api", "dev"]

FROM deps AS builder
COPY apps/api/ ./apps/api/
COPY packages/shared/ ./packages/shared/
RUN pnpm --filter @skynet/api build

FROM base AS prod-deps
ENV npm_config_build_from_source=true
RUN apt-install python3 make g++
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY scripts/prepare.mjs ./scripts/prepare.mjs
RUN --mount=type=cache,id=pnpm-api-prod,target=/pnpm/store,sharing=locked pnpm install --prod --filter @skynet/api --frozen-lockfile --ignore-scripts

FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS prod
ENV NODE_ENV=production
ENV API_PORT=8081
WORKDIR /app/apps/api
RUN chown -R node:node /app
COPY --chown=node:node --from=prod-deps /app/node_modules /app/node_modules
COPY --chown=node:node --from=prod-deps /app/apps/api/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/apps/api/dist ./dist
COPY --chown=node:node package.json /app/package.json
COPY --chown=node:node config /app/config
COPY --chown=node:node apps/api/package.json ./package.json
EXPOSE 8081
USER node
CMD ["node", "dist/main.js"]
