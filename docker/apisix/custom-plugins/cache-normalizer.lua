--
-- cache-normalizer
--
-- Custom APISIX plugin for the OSS "Apisix Cache" project.
--
-- Responsibilities:
--   1. Compute a deterministic `$normalized_cache_key` Nginx variable from the
--      request query string and/or JSON body, keeping only the fields that the
--      cache rule declares as relevant (allowed_body_fields / query_fields).
--      This is consumed by the `proxy-cache` plugin's `cache_key`.
--   2. Report cache hit/miss status back to the control plane (AdonisJS) in
--      the `log` phase via a fire-and-forget HTTP request.
--
local core = require("apisix.core")
local cjson = require("cjson.safe")

local plugin_name = "cache-normalizer"

-- Telemetry batching: instead of one HTTP call per request, hit/miss counts
-- are accumulated in a shared dict and flushed periodically in bulk.
local STATS_DICT = "stats_buffer"
local STATS_FLUSH_INTERVAL = 5 -- seconds

local schema = {
  type = "object",
  properties = {
    rule_id = { type = "integer", minimum = 1 },
    allowed_body_fields = {
      type = "array",
      items = { type = "string" },
      default = {},
    },
    query_fields = {
      type = "array",
      items = { type = "string" },
      default = {},
    },
    stats_endpoint = { type = "string" },
    stats_token = { type = "string" },
    generation = { type = "integer", minimum = 1 },
  },
  required = { "rule_id" },
}

local _M = {
  version = 0.1,
  priority = 2500,
  name = plugin_name,
  schema = schema,
}

function _M.check_schema(conf)
  local ok, err = core.schema.check(schema, conf)
  if not ok then
    return false, err
  end
  return true
end

local function sorted_pairs_join(map)
  local keys = {}
  for key in pairs(map) do
    table.insert(keys, key)
  end
  table.sort(keys)

  local parts = {}
  for _, key in ipairs(keys) do
    table.insert(parts, key .. "=" .. tostring(map[key]))
  end
  return table.concat(parts, "&")
end

local function find_header(headers, name)
  if not headers then
    return nil
  end
  if headers[name] ~= nil then
    return headers[name]
  end
  local lower = string.lower(name)
  for key, value in pairs(headers) do
    if string.lower(key) == lower then
      return value
    end
  end
  return nil
end

function _M.rewrite(conf, ctx)
  local query_part = ""
  local body_part = ""

  -- Query string normalization
  if conf.query_fields and #conf.query_fields > 0 then
    local args = ngx.req.get_uri_args()
    local picked = {}
    for _, key in ipairs(conf.query_fields) do
      local value = args[key]
      if value ~= nil then
        if type(value) == "table" then
          table.sort(value)
          picked[key] = table.concat(value, ",")
        else
          picked[key] = tostring(value)
        end
      end
    end
    query_part = sorted_pairs_join(picked)
  else
    query_part = ngx.var.args or ""
  end

  -- JSON body normalization (POST / PUT / PATCH)
  if conf.allowed_body_fields and #conf.allowed_body_fields > 0 then
    local body = core.request.get_body()
    if body then
      local json_data = cjson.decode(body)
      if json_data and type(json_data) == "table" then
        local picked = {}
        for _, key in ipairs(conf.allowed_body_fields) do
          local value = json_data[key]
          if value ~= nil then
            if type(value) == "table" then
              picked[key] = cjson.encode(value)
            else
              picked[key] = tostring(value)
            end
          end
        end
        body_part = sorted_pairs_join(picked)
      else
        -- Non-JSON body: fall back to a full-body hash
        body_part = ngx.md5(body)
      end
    end
  else
    local body = core.request.get_body()
    if body then
      body_part = ngx.md5(body)
    end
  end

  local raw = query_part .. "|" .. body_part
  ctx.var.normalized_cache_key = ngx.md5(raw)

  -- Generation stamp consumed by proxy-cache's cache_key. The control plane
  -- bumps the generation to invalidate every cached entry for this rule at
  -- once, without needing a parameter-specific purge.
  ctx.var.cache_generation = tostring(conf.generation or 1)
end

local function flush_stats()
  local dict = ngx.shared[STATS_DICT]
  if not dict then
    return
  end

  local endpoint = dict:get("__endpoint")
  if not endpoint then
    return
  end
  local token = dict:get("__token") or ""

  -- Collect every non-zero counter and reset it for the next window.
  local reports = {}
  for _, key in ipairs(dict:get_keys(0)) do
    if key ~= "__endpoint" and key ~= "__token" then
      local count = tonumber(dict:get(key)) or 0
      if count > 0 then
        local rule_id, status = key:match("^(%d+):(%w+)$")
        if rule_id then
          table.insert(reports, {
            rule_id = tonumber(rule_id),
            status = status,
            count = count,
          })
          dict:set(key, 0)
        end
      end
    end
  end

  if #reports == 0 then
    return
  end

  -- Fire-and-forget: a failed flush must never affect traffic.
  local ok, err = pcall(function()
    local httpc = require("resty.http").new()
    httpc:set_timeout(2000)
    local _, req_err = httpc:request_uri(endpoint, {
      method = "POST",
      headers = {
        ["Content-Type"] = "application/json",
        ["X-Stats-Token"] = token,
      },
      body = cjson.encode({ reports = reports }),
      ssl_verify = false,
    })
    if req_err then
      core.log.error("cache-normalizer stats flush failed: ", req_err)
    end
    httpc:close()
  end)

  if not ok then
    core.log.error("cache-normalizer stats flush error: ", tostring(err))
  end
end

local function schedule_flush()
  local ok, err = ngx.timer.at(STATS_FLUSH_INTERVAL, function(premature)
    if premature then
      return
    end
    flush_stats()
    schedule_flush()
  end)

  if not ok then
    core.log.error("cache-normalizer failed to schedule stats flush: ", err)
  end
end

function _M.init_worker()
  if not ngx.shared[STATS_DICT] then
    core.log.error(
      "cache-normalizer: shared dict '",
      STATS_DICT,
      "' not found; add it to nginx_config.http.custom_lua_shared_dict"
    )
    return
  end
  schedule_flush()
end

function _M.log(conf, ctx)
  local status = nil

  -- proxy-cache exposes its result via the "Apisix-Cache-Status" response
  -- header when hide_cache_headers is false.
  local headers = ngx.resp.get_headers and ngx.resp.get_headers() or nil
  local header_value = find_header(headers, "Apisix-Cache-Status")
  if header_value then
    status = string.upper(header_value)
  end

  -- Fallback to the nginx variable set by proxy-cache (when available).
  if not status and ctx.var.proxy_cache_status then
    status = string.upper(ctx.var.proxy_cache_status)
  end

  if not status or not conf.stats_endpoint then
    return
  end

  local dict = ngx.shared[STATS_DICT]
  if not dict then
    return
  end

  -- Remember where to send the next flush. All rules in this project share
  -- the same endpoint/token, so overwriting on every request is harmless.
  dict:set("__endpoint", conf.stats_endpoint)
  dict:set("__token", conf.stats_token or "")

  local key = tostring(conf.rule_id) .. ":" .. status
  local _, incr_err = dict:incr(key, 1, 0)
  if incr_err then
    core.log.error("cache-normalizer stats buffer increment failed: ", incr_err)
  end
end

return _M
