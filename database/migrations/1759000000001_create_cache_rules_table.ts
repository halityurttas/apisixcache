import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cache_rules'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()

      // Human readable rule name
      table.string('name').notNullable()

      // Path pattern to match, e.g. /v1/flights/search
      table.string('endpoint_pattern').notNullable()

      // External pay-per-call API base URL, e.g. https://api.example.com
      table.string('upstream_url').notNullable()

      // HTTP methods to cache (JSON array of strings)
      table.json('methods').notNullable()

      // Cache TTL in seconds
      table.integer('ttl_seconds').notNullable().defaultTo(300)

      // Thundering herd protection (single flight)
      table.boolean('cache_lock').notNullable().defaultTo(true)

      // Basic rate limiting (requests per second), nullable = disabled
      table.integer('rate_limit_rps').nullable()

      // JSON body fields included in the cache key (POST). null = full body hash
      table.json('allowed_body_fields').nullable()

      // Query string params included in the cache key (GET). null = full query
      table.json('query_fields').nullable()

      // Whether the rule is pushed to APISIX and enforced
      table.boolean('is_active').notNullable().defaultTo(true)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
