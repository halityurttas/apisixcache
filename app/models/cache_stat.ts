import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import CacheRule from '#models/cache_rule'

/**
 * Aggregated hit/miss counters for a cache rule.
 * Reported asynchronously by the APISIX data plane.
 */
export default class CacheStat extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare ruleId: number

  @column()
  declare cacheHits: number

  @column()
  declare cacheMisses: number

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => CacheRule, { foreignKey: 'ruleId' })
  declare rule: BelongsTo<typeof CacheRule>
}
