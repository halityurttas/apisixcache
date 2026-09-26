/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  // Session
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory', 'database'] as const),
  SESSION_SECURE: Env.schema.boolean.optional(),

  // Single admin account (seeded)
  ADMIN_EMAIL: Env.schema.string(),
  ADMIN_PASSWORD: Env.schema.string(),

  // APISIX data plane
  APISIX_ADMIN_API_URL: Env.schema.string(),
  APISIX_ADMIN_KEY: Env.schema.string(),
  APISIX_GATEWAY_URL: Env.schema.string(),

  // Stats ingestion (APISIX data plane -> control plane)
  STATS_INGEST_URL: Env.schema.string(),
  STATS_INGEST_TOKEN: Env.schema.string(),
})
