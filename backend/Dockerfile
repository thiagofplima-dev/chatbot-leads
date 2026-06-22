# =============================================
# Stage 1: Build
# =============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json tsconfig.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy for runtime stage
RUN cp -R node_modules /prod_modules

# Install all dependencies (including dev) for build
RUN npm ci

# Copy source code
COPY src/ ./src/
COPY templates/ ./templates/

# Build TypeScript
RUN npm run build

# =============================================
# Stage 2: Runtime
# =============================================
FROM node:20-alpine AS runtime

WORKDIR /app

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy built artifacts and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /prod_modules ./node_modules
COPY --from=builder /app/templates ./templates
COPY package.json ./

# Create storage directory for proposals
RUN mkdir -p storage/propostas && \
    chown -R appuser:appgroup /app

# Use non-root user
USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start server
CMD ["node", "dist/index.js"]
