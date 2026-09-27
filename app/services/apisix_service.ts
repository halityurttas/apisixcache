import env from '#start/env'
import type CacheRule from '#models/cache_rule'

/**
 * ApisixService translates a `CacheRule` into an APISIX route and pushes it
 * to the APISIX Admin API. It is the only place where the control plane
 * talks to the data plane.
 */
export class ApisixService {
  private adminApiUrl = env.get('APISIX_ADMIN_API_URL')
  private adminApiKey = env.get('APISIX_ADMIN_KEY')

  private routeId(rule: CacheRule): string {
    return `cache-rule-${rule.id}`
  }

  /**
   * Build the APISIX route payload for a cache rule.
   */
  private buildRoute(rule: CacheRule) {
    const node = this.parseUpstream(rule.upstreamUrl)
    const plugins: Record<string, unknown> = {}

    // 1. Body/query normalizer — computes $normalized_cache_key
    plugins['cache-normalizer'] = {
      rule_id: rule.id,
      allowed_body_fields: rule.allowedBodyFields ?? [],
      query_fields: rule.queryFields ?? [],
      stats_endpoint: env.get('STATS_INGEST_URL'),
      stats_token: env.get('STATS_INGEST_TOKEN'),
      generation: rule.generation ?? 1,
    }

    // 2. Basic rate limiting (optional)
    if (rule.rateLimitRps) {
      plugins['limit-req'] = {
        rate: rule.rateLimitRps,
        burst: rule.rateLimitRps * 2,
        key_type: 'var',
        key: 'remote_addr',
        rejected_code: 429,
      }
    }

    // 3. Proxy cache — the actual caching layer
    plugins['proxy-cache'] = {
      cache_strategy: 'disk',
      cache_zone: 'disk_cache_one',
      /**
       * NOTE: `$host` is intentionally NOT part of the cache key. The control
       * plane issues PURGE requests using its internal gateway hostname
       * (http://apisix:9080), while clients use the public one — including
       * `$host` would make purge compute a different key and fail with 404.
       *
       * `$cache_generation` lets the control plane invalidate every entry for
       * this rule at once by bumping `generation` on purge.
       */
      cache_key: ['$uri', '$normalized_cache_key', '$cache_generation'],
      cache_method: rule.methods,
      cache_http_status: [200, 301, 302],
      cache_ttl: rule.ttlSeconds,
      cache_lock: rule.cacheLock,
      hide_cache_headers: false,
    }

    return {
      id: this.routeId(rule),
      name: this.routeId(rule),
      uri: rule.endpointPattern,
      /**
       * PURGE is added on top of the cacheable methods so the control plane
       * can invalidate cached responses. `proxy-cache` intercepts PURGE
       * requests and purges the matching cache entry.
       */
      methods: Array.from(new Set([...rule.methods, 'PURGE'])),
      plugins,
      upstream: {
        type: 'roundrobin',
        scheme: node.scheme,
        pass_host: 'node',
        nodes: { [node.host]: 1 },
      },
    }
  }

  /**
   * Parse an upstream URL into an APISIX node descriptor.
   */
  private parseUpstream(url: string): { scheme: 'http' | 'https'; host: string } {
    const parsed = new URL(url)
    const scheme = parsed.protocol.replace(':', '') as 'http' | 'https'
    const port = parsed.port || (scheme === 'https' ? 443 : 80)
    return { scheme, host: `${parsed.hostname}:${port}` }
  }

  /**
   * Create or update the route on APISIX. Deactivates by deleting the route
   * when the rule is not active.
   */
  async syncRoute(rule: CacheRule): Promise<boolean> {
    if (!rule.isActive) {
      return this.deleteRoute(rule)
    }

    const body = this.buildRoute(rule)
    const response = await fetch(`${this.adminApiUrl}/routes/${this.routeId(rule)}`, {
      method: 'PUT',
      headers: {
        'X-API-KEY': this.adminApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    return response.ok
  }

  /**
   * Delete the route from APISIX.
   */
  async deleteRoute(rule: CacheRule): Promise<boolean> {
    const response = await fetch(`${this.adminApiUrl}/routes/${this.routeId(rule)}`, {
      method: 'DELETE',
      headers: {
        'X-API-KEY': this.adminApiKey,
      },
    })

    return response.ok || response.status === 404
  }

  /**
   * Invalidate every cached entry for a rule by bumping its cache generation
   * and re-syncing the route. Old entries become unreachable (their key no
   * longer matches) and expire naturally by TTL.
   */
  async purge(rule: CacheRule): Promise<{ ok: boolean; status: number }> {
    rule.generation = (rule.generation ?? 1) + 1
    await rule.save()

    const synced = await this.syncRoute(rule)
    return { ok: synced, status: synced ? 200 : 502 }
  }
}
