#!/bin/sh
set -e

# Run database migrations and seed the single admin account, then start the
# HTTP server. Both steps are idempotent.
node ace migration:run --force
node ace db:seed

exec node bin/server.js
