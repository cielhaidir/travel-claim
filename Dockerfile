# syntax=docker.io/docker/dockerfile:1

FROM node:20 AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
#RUN apk add --no-cache libc6-compat libssl3
RUN apt-get update && apt-get install -y \
  libssl3 openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies based on the preferred package manager
COPY prisma ./prisma
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* .npmrc* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci --legacy-peer-deps; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# Copy the prisma-generated client produced by postinstall in the deps stage
COPY --from=deps /app/generated ./generated
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1
# Build Next.js (standalone output)
ENV SKIP_ENV_VALIDATION=1

# Re-run prisma generate to ensure the client matches the copied schema
RUN npx prisma generate

RUN \
  if [ -f yarn.lock ]; then yarn run build; \
  elif [ -f package-lock.json ]; then npm run build; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm run build; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1
# Build Next.js (standalone output)
ENV SKIP_ENV_VALIDATION=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 --home /home/nextjs nextjs

COPY --from=builder /app/public ./public
COPY prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

# Create upload directories and set permissions
RUN mkdir -p /app/public/uploads /app/public/assets && \
    chown -R nextjs:nodejs /app/public/uploads /app/public/assets

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Copy the server app directory to include clientReferenceManifest files
# This fixes the "Invariant: Expected clientReferenceManifest to be defined" error
COPY --from=builder --chown=nextjs:nodejs /app/.next/server/app ./.next/server/app
# COPY --from=builder /app/scripts ./scripts

# Install global packages as root before switching user
# RUN npm install -g tsx prisma

# Create npm cache directory for nextjs user
RUN mkdir -p /home/nextjs/.npm && chown -R nextjs:nodejs /home/nextjs

USER nextjs

EXPOSE 3000

ENV PORT=3000

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/config/next-config-js/output
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

