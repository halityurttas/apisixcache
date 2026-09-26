import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cache_stats'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('rule_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('cache_rules')
        .onDelete('CASCADE')

      // Aggregated counters reported by the APISIX data plane
      table.integer('cache_hits').notNullable().defaultTo(0)
      table.integer('cache_misses').notNullable().defaultTo(0)

      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
