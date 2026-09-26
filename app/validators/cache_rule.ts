import vine from '@vinejs/vine'

const methodsSchema = vine
  .array(vine.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']))
  .minLength(1)

/**
 * Validator for creating / updating a cache rule.
 *
 * `allowedBodyFields` / `queryFields` are submitted as comma-separated
 * strings and parsed into arrays by the controller. `rateLimitRps` is
 * submitted as a string so that an empty field can be treated as "disabled".
 */
export const cacheRuleValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(120),
  endpointPattern: vine.string().trim().minLength(1).maxLength(255),
  // `require_tld: false` so internal/self-hosted upstreams such as
  // http://api.internal:8080 or http://app:3333 are accepted.
  upstreamUrl: vine.string().url({ require_tld: false }).maxLength(2000),
  methods: methodsSchema,
  ttlSeconds: vine.number().min(1).max(31536000),
  cacheLock: vine.boolean().optional(),
  rateLimitRps: vine.string().trim().optional(),
  allowedBodyFields: vine.string().trim().maxLength(2000).optional(),
  queryFields: vine.string().trim().maxLength(2000).optional(),
  isActive: vine.boolean().optional(),
})
