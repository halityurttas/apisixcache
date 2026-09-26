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

  local endpoint = conf.stats_endpoint
  local token = conf.stats_token or ""
  local rule_id = conf.rule_id

  -- Fire-and-forget: never block or break the request on reporting failures.
  local ok, err = ngx.timer.at(0, function(premature)
    if premature then
      return
    end

    local ok_pcall, res_err = pcall(function()
      local httpc = require("resty.http").new()
      httpc:set_timeout(2000)
      local _, req_err = httpc:request_uri(endpoint, {
        method = "POST",
        headers = {
          ["Content-Type"] = "application/json",
          ["X-Stats-Token"] = token,
        },
        body = cjson.encode({ rule_id = rule_id, status = status }),
        ssl_verify = false,
      })
      if req_err then
        core.log.error("cache-normalizer stats report failed: ", req_err)
      end
      httpc:close()
    end)

    if not ok_pcall then
      core.log.error("cache-normalizer stats reporter error: ", tostring(res_err))
    end
  end)

  if not ok then
    core.log.error("cache-normalizer failed to create stats timer: ", err)
  end
end

return _M
