# Control plane (AdonisJS) image for the OSS "Apisix Cache" project.

# --- build stage ---------------------------------------------------------
FROM node:24-slim AS build
# Build tools are only needed if better-sqlite3 has no prebuilt binary.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Regenerate the .adonisjs type/index files (routes.d.ts, controllers.ts, ...).
# The .adonisjs directory is excluded from the build context, so these must be
# produced before type-checking/building.
RUN node ace codegen
RUN node ace build

# --- runtime stage -------------------------------------------------------
FROM node:24-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/build ./
RUN npm ci --omit=dev

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3333

COPY docker/app/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3333
ENTRYPOINT ["/entrypoint.sh"]
