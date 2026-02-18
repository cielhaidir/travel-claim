# ============================================================
# Stage 1 – builder: install deps + compile Next.js on Alpine
# ============================================================
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Copy manifests and schema
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Step 1: install deps without running scripts (avoids esbuild ETXTBSY)
RUN npm ci --legacy-peer-deps --ignore-scripts

# Step 2: force-install the linux-x64-musl native binaries that the macOS
#         lockfile resolved as darwin variants and therefore didn't install.
RUN npm install --no-save --legacy-peer-deps \
      lightningcss-linux-x64-musl@1.30.2 \
      @esbuild/linux-x64@0.27.3

# Step 3: generate Prisma client for linux
RUN npx --no prisma generate

# Copy the full source
COPY . .

# Build Next.js (standalone output)
ENV SKIP_ENV_VALIDATION=1
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ============================================================
# Stage 2 – runner: minimal production image
# ============================================================
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Next.js standalone bundle + static assets + public dir
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public           ./public

# Prisma schema + migrations + generated client
COPY --from=builder /app/prisma                     ./prisma
COPY --from=builder /app/generated                  ./generated
COPY --from=builder /app/node_modules/.prisma       ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma       ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma        ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma   ./node_modules/.bin/prisma

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node server.js"]
