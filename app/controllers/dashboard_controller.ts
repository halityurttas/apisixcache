import CacheRule from '#models/cache_rule'
import CacheStat from '#models/cache_stat'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Dashboard shows an overview of every cache rule along with its
 * hit/miss counters and the resulting cost savings.
 */
export default class DashboardController {
  async index({ view }: HttpContext) {
    const rules = await CacheRule.query().orderBy('createdAt', 'desc')
    const stats = await CacheStat.query()

    const statByRule = new Map(stats.map((stat) => [stat.ruleId, stat]))

    const rows = rules.map((rule) => {
      const stat = statByRule.get(rule.id)
      const hits = stat?.cacheHits ?? 0
      const misses = stat?.cacheMisses ?? 0
      const total = hits + misses
      return {
        rule,
        hits,
        misses,
        hitRate: total > 0 ? Math.round((hits / total) * 100) : 0,
      }
    })

    const totals = rows.reduce(
      (acc, row) => {
        acc.hits += row.hits
        acc.misses += row.misses
        return acc
      },
      { hits: 0, misses: 0 }
    )
    const totalCalls = totals.hits + totals.misses
    const overallHitRate = totalCalls > 0 ? Math.round((totals.hits / totalCalls) * 100) : 0

    return view.render('pages/dashboard', { rows, totals, totalCalls, overallHitRate })
  }
}
