FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

ARG DOCKER_GID=999

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    if getent group ${DOCKER_GID} >/dev/null 2>&1; then \
      DOCKER_GROUP=$(getent group ${DOCKER_GID} | cut -d: -f1); \
    else \
      addgroup --system --gid ${DOCKER_GID} hostdocker; \
      DOCKER_GROUP=hostdocker; \
    fi && \
    addgroup nextjs "$DOCKER_GROUP"

# Install curl for healthcheck, docker-cli for service restart
RUN apk add --no-cache curl docker-cli

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Create directory for state.json
RUN mkdir -p /app/data && chown nextjs:nodejs /app /app/data

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV STATE_PATH=/app/data/state.json

CMD ["node", "server.js"]
