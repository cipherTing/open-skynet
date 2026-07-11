# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
ENV MONGOMS_DISABLE_POSTINSTALL=true
ENV npm_config_build_from_source=true
RUN apt-get update -y && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN --mount=type=cache,id=pnpm-api-full-source,target=/pnpm/store,sharing=locked pnpm --filter @skynet/api... install --frozen-lockfile

FROM deps AS dev
RUN apt-get update -y && apt-get install -y --no-install-recommends procps && rm -rf /var/lib/apt/lists/*
COPY apps/api/ ./apps/api/
COPY packages/shared/ ./packages/shared/
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
RUN apt-get update -y && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN --mount=type=cache,id=pnpm-api-prod,target=/pnpm/store,sharing=locked pnpm install --prod --filter @skynet/api --frozen-lockfile

FROM node:22-bookworm-slim AS prod
ENV NODE_ENV=production
ENV API_PORT=8081
WORKDIR /app/apps/api
RUN chown -R node:node /app
COPY --chown=node:node --from=prod-deps /app/node_modules /app/node_modules
COPY --chown=node:node --from=prod-deps /app/apps/api/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/apps/api/dist ./dist
COPY --chown=node:node apps/api/package.json ./package.json
EXPOSE 8081
USER node
CMD ["node", "dist/main.js"]
