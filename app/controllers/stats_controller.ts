import CacheRule from '#models/cache_rule'
import CacheStat from '#models/cache_stat'
import env from '#start/env'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Receives asynchronous hit/miss reports from the APISIX data plane and
 * increments the matching counter for a cache rule.
 */
export default class StatsController {
  async ingest({ request, response }: HttpContext) {
    const token = request.header('X-Stats-Token')
    if (!token || token !== env.get('STATS_INGEST_TOKEN')) {
      return response.unauthorized({ error: 'Invalid stats token' })
    }

    const body = request.body()
    const ruleId = Number(body?.rule_id)
    const status = String(body?.status ?? '').toUpperCase()

    if (!Number.isInteger(ruleId) || ruleId <= 0 || !status) {
      return response.badRequest({ error: 'rule_id and status are required' })
    }

    // "Served from cache without hitting upstream" counts as a hit.
    const isHit = ['HIT', 'STALE', 'UPDATING'].includes(status)
    const isMiss = ['MISS', 'EXPIRED', 'BYPASS'].includes(status)

    if (!isHit && !isMiss) {
      return response.badRequest({ error: `Unknown cache status: ${status}` })
    }

    // Ignore reports for rules that no longer exist.
    const rule = await CacheRule.find(ruleId)
    if (!rule) {
      return response.ok({ ok: true, ignored: true })
    }

    let stat = await CacheStat.query().where('ruleId', ruleId).first()
    if (!stat) {
      stat = await CacheStat.create({ ruleId, cacheHits: 0, cacheMisses: 0 })
    }

    if (isHit) {
      await CacheStat.query().where('id', stat.id).increment('cacheHits', 1)
    } else {
      await CacheStat.query().where('id', stat.id).increment('cacheMisses', 1)
    }

    return response.ok({ ok: true })
  }
}
