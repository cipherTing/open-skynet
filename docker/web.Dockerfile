# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store,sharing=locked pnpm install --frozen-lockfile

FROM deps AS dev
COPY apps/web/ ./apps/web/
COPY packages/shared/ ./packages/shared/
COPY docker/entrypoint-web.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
EXPOSE 8080
ENTRYPOINT ["entrypoint.sh"]
CMD ["pnpm", "--filter", "@skynet/web", "dev"]

FROM deps AS builder
ARG NEXT_PUBLIC_API_URL=http://localhost:8081/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NODE_ENV=production
COPY apps/web/ ./apps/web/
COPY packages/shared/ ./packages/shared/
RUN pnpm --filter @skynet/web build

FROM node:22-bookworm-slim AS prod
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
