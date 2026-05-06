# Scraper Dockerfile — lightweight HTTP scraper (no browser needed)
FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm@10

# Builder stage
FROM base AS builder

WORKDIR /app

# Copy root package files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY turbo.json ./

# Copy workspace packages needed for build
COPY packages/shared/package.json ./packages/shared/
COPY packages/scraper/package.json ./packages/scraper/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/scraper ./packages/scraper

# Build shared package first
RUN pnpm --filter @espn-fantasy/shared build

# Build scraper
RUN pnpm --filter @espn-fantasy/scraper build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10

# Copy package files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/scraper/package.json ./packages/scraper/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/scraper/dist ./packages/scraper/dist

WORKDIR /app/packages/scraper

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD node -e "require('http').get('http://localhost:3002/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "dist/index.js"]

CMD ["node", "dist/index.js"]
