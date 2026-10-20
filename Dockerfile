FROM node:22-alpine AS dependencies

RUN apk upgrade --no-cache libcrypto3 libssl3

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime

RUN apk upgrade --no-cache libcrypto3 libssl3

WORKDIR /app

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY --from=dependencies --chown=1000:1000 /app/node_modules ./node_modules

# Server and package metadata
COPY --chown=1000:1000 package.json server.js ./

# Server-side source
COPY --chown=1000:1000 sql ./sql
COPY --chown=1000:1000 src ./src

# ATLAS Align browser application
COPY --chown=1000:1000 index.html styles.css ./
COPY --chown=1000:1000 css ./css
COPY --chown=1000:1000 sections ./sections
COPY --chown=1000:1000 js ./js
COPY --chown=1000:1000 vendor ./vendor
COPY --chown=1000:1000 tutorials ./tutorials
COPY --chown=1000:1000 validation ./validation

# Supporting source catalogs
COPY --chown=1000:1000 catalogs ./catalogs

# Launch migrations and policy
COPY --chown=1000:1000 .launch ./.launch

ENV NODE_ENV=production
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-8080}/api/health" >/dev/null || exit 1
CMD ["node", "server.js"]
