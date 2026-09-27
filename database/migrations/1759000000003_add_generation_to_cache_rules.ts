import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cache_rules'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Cache generation. Purge increments this to invalidate every cached
      // entry for the rule at once (the cache key includes the generation).
      table.integer('generation').notNullable().defaultTo(1)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('generation')
    })
  }
}
