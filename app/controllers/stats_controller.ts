import CacheRule from '#models/cache_rule'
import CacheStat from '#models/cache_stat'
import env from '#start/env'
import type { HttpContext } from '@adonisjs/core/http'

interface StatsReport {
  ruleId: number
  status: string
  count: number
}

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

    const reports = this.normalizeReports(request.body())
    if (reports === null) {
      return response.badRequest({ error: 'rule_id and status are required' })
    }

    for (const report of reports) {
      await this.applyReport(report)
    }

    return response.ok({ ok: true, applied: reports.length })
  }

  /**
   * Normalize the request body into a list of reports. Accepts either a single
   * legacy report `{ rule_id, status }` or a batched
   * `{ reports: [{ rule_id, status, count }] }` payload produced by the
   * cache-normalizer's periodic flush. Returns null when invalid.
   */
  private normalizeReports(body: any): StatsReport[] | null {
    const raw = Array.isArray(body?.reports) ? body.reports : [body]
    const reports: StatsReport[] = []

    for (const item of raw) {
      const ruleId = Number(item?.rule_id)
      const status = String(item?.status ?? '').toUpperCase()
      const count = Number(item?.count ?? 1)

      if (!Number.isInteger(ruleId) || ruleId <= 0 || !status) {
        return null
      }
      if (!Number.isInteger(count) || count <= 0) {
        return null
      }

      const isHit = ['HIT', 'STALE', 'UPDATING'].includes(status)
      const isMiss = ['MISS', 'EXPIRED', 'BYPASS'].includes(status)
      if (!isHit && !isMiss) {
        return null
      }

      reports.push({ ruleId, status, count })
    }

    return reports.length > 0 ? reports : null
  }

  /**
   * Increment the hit/miss counters for a single report. Reports for rules
   * that no longer exist are silently ignored.
   */
  private async applyReport(report: StatsReport) {
    const rule = await CacheRule.find(report.ruleId)
    if (!rule) {
      return
    }

    let stat = await CacheStat.query().where('ruleId', report.ruleId).first()
    if (!stat) {
      stat = await CacheStat.create({
        ruleId: report.ruleId,
        cacheHits: 0,
        cacheMisses: 0,
      })
    }

    const isHit = ['HIT', 'STALE', 'UPDATING'].includes(report.status)
    if (isHit) {
      await CacheStat.query().where('id', stat.id).increment('cacheHits', report.count)
    } else {
      await CacheStat.query().where('id', stat.id).increment('cacheMisses', report.count)
    }
  }
}
