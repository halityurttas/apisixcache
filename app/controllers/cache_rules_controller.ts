import CacheRule from '#models/cache_rule'
import { ApisixService } from '#services/apisix_service'
import { cacheRuleValidator } from '#validators/cache_rule'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Parse comma/newline separated input into a trimmed string array.
 * Returns null when there are no values (meaning "use full body/query").
 */
function parseFieldList(value: string | undefined): string[] | null {
  const list = (value ?? '')
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  return list.length > 0 ? list : null
}

/**
 * Coerce the validated payload into the model's shape.
 */
function parsePayload(payload: Record<string, unknown>) {
  const rateLimitRps = Number(payload.rateLimitRps)
  return {
    name: payload.name as string,
    endpointPattern: payload.endpointPattern as string,
    upstreamUrl: payload.upstreamUrl as string,
    methods: payload.methods as string[],
    ttlSeconds: payload.ttlSeconds as number,
    cacheLock: (payload.cacheLock as boolean) ?? false,
    rateLimitRps: Number.isInteger(rateLimitRps) && rateLimitRps > 0 ? rateLimitRps : null,
    allowedBodyFields: parseFieldList(payload.allowedBodyFields as string | undefined),
    queryFields: parseFieldList(payload.queryFields as string | undefined),
    isActive: (payload.isActive as boolean) ?? true,
  }
}

export default class CacheRulesController {
  async index({ view }: HttpContext) {
    const rules = await CacheRule.query().orderBy('createdAt', 'desc')
    return view.render('pages/cache_rules/index', { rules })
  }

  async create({ view }: HttpContext) {
    return view.render('pages/cache_rules/form', { rule: null })
  }

  async edit({ params, view }: HttpContext) {
    const rule = await CacheRule.findOrFail(params.id)
    return view.render('pages/cache_rules/form', { rule })
  }

  async store({ request, response, session }: HttpContext) {
    const validated = await request.validateUsing(cacheRuleValidator)
    const payload = parsePayload(validated as unknown as Record<string, unknown>)

    const rule = await CacheRule.create(payload)
    const synced = await new ApisixService().syncRoute(rule)

    session.flash(
      synced ? 'success' : 'error',
      synced
        ? 'Cache rule created and synced to APISIX.'
        : 'Rule saved locally, but syncing to APISIX failed. Check the APISIX admin connection.'
    )
    return response.redirect().toRoute('cache_rules.index')
  }

  async update({ params, request, response, session }: HttpContext) {
    const rule = await CacheRule.findOrFail(params.id)
    const validated = await request.validateUsing(cacheRuleValidator)
    const payload = parsePayload(validated as unknown as Record<string, unknown>)

    rule.merge(payload)
    await rule.save()

    const synced = await new ApisixService().syncRoute(rule)
    session.flash(
      synced ? 'success' : 'error',
      synced
        ? 'Cache rule updated and synced to APISIX.'
        : 'Rule saved locally, but syncing to APISIX failed.'
    )
    return response.redirect().toRoute('cache_rules.index')
  }

  async destroy({ params, response, session }: HttpContext) {
    const rule = await CacheRule.findOrFail(params.id)
    await new ApisixService().deleteRoute(rule)
    await rule.delete()

    session.flash('success', 'Cache rule deleted.')
    return response.redirect().toRoute('cache_rules.index')
  }

  async purge({ params, response, session }: HttpContext) {
    const rule = await CacheRule.findOrFail(params.id)
    const result = await new ApisixService().purge(rule)

    session.flash(
      result.ok ? 'success' : 'error',
      result.ok
        ? `Cache purged for "${rule.name}" (HTTP ${result.status}).`
        : `Purge failed (HTTP ${result.status}). Make sure the gateway is reachable.`
    )
    return response.redirect().toRoute('cache_rules.index')
  }
}
