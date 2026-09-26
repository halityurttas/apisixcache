import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

/**
 * A cache rule maps to a single APISIX route.
 *
 * It describes which external endpoint should be cached, for how long,
 * and which request fields are relevant for the cache key.
 */
export default class CacheRule extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare endpointPattern: string

  @column()
  declare upstreamUrl: string

  @column({
    prepare: (value: string[]) => JSON.stringify(value),
    consume: (value: string) => JSON.parse(value) as string[],
  })
  declare methods: string[]

  @column()
  declare ttlSeconds: number

  @column()
  declare cacheLock: boolean

  @column()
  declare rateLimitRps: number | null

  @column({
    prepare: (value: string[] | null) => (value === null ? null : JSON.stringify(value)),
    consume: (value: string | null) => (value === null ? null : (JSON.parse(value) as string[])),
  })
  declare allowedBodyFields: string[] | null

  @column({
    prepare: (value: string[] | null) => (value === null ? null : JSON.stringify(value)),
    consume: (value: string | null) => (value === null ? null : (JSON.parse(value) as string[])),
  })
  declare queryFields: string[] | null

  @column()
  declare isActive: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
