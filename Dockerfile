FROM node:22-alpine AS base

WORKDIR /app

RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libc6-compat \
    openssl \
    ca-certificates \
    && npm install -g dotenv-cli

# Build args for client env vars (Vite embeds these at build time)
ARG VITE_APP_URL
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST

ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY
ENV VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST

FROM base AS deps

COPY package.json package-lock.json* ./
RUN npm ci --only=production

FROM base AS builder

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npm run build && npm run db:generate:docker

FROM base AS runner

ARG VITE_APP_URL
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST

ENV NODE_ENV=production
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY
ENV VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/public ./public
COPY --from=builder /app/src/generated ./src/generated

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]