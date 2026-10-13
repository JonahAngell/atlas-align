
FROM node:22-alpine AS dependencies

RUN apk upgrade --no-cache libcrypto3 libssl3

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

FROM node:22-alpine AS runtime

RUN apk upgrade --no-cache libcrypto3 libssl3

WORKDIR /app

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY --from=dependencies /app/node_modules ./node_modules

# Server and package metadata
COPY package.json server.js ./

# Server-side source
COPY sql ./sql
COPY src ./src

# ATLAS Align browser application
COPY index.html styles.css ./
COPY css ./css
COPY sections ./sections
COPY js ./js
COPY vendor ./vendor
COPY tutorials ./tutorials
COPY validation ./validation

# Supporting source catalogs
COPY catalogs ./catalogs

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]


