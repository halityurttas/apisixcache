<div align="center">

# Apisix Cache — OSS

**Cut the bill on pay-per-call APIs by caching them behind Apache APISIX.**

Google Maps, flight search, weather, currency rates… if you pay per request
and many of those requests are identical, you are paying for the same answer
again and again. Apisix Cache sits in front of those APIs and answers repeat
calls from cache.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Apache APISIX](https://img.shields.io/badge/Apache%20APISIX-3.10-E6522C.svg)](https://apisix.apache.org/)
[![AdonisJS](https://img.shields.io/badge/AdonisJS-7-5A45FF.svg)](https://adonisjs.com/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24-339933.svg)](https://nodejs.org/)
[![Docker Compose](https://img.shields.io/badge/docker-compose-2496ED.svg)](docker-compose.yml)

[Quick start](#-quick-start) ·
[How it works](#-how-it-works) ·
[Configuration](#-configuration) ·
[Production checklist](#-production-checklist) ·
[FAQ](#-faq)

</div>

---

## Table of contents

- [Why?](#-why)
- [Features](#-features)
- [Architecture](#-architecture)
- [Quick start](#-quick-start)
- [Your first cache rule](#-your-first-cache-rule)
- [How it works](#-how-it-works)
- [Configuration](#-configuration)
- [Local development](#-local-development)
- [Project structure](#-project-structure)
- [Production checklist](#-production-checklist)
- [Troubleshooting](#-troubleshooting)
- [FAQ](#-faq)
- [OSS vs PRO](#-oss-vs-pro)
- [Contributing](#-contributing)
- [License](#-license)

## 💡 Why?

Many third-party APIs charge **per call**, yet a large share of real traffic
is repetitive: the same address geocoded thousands of times, the same
currency pair requested every second, the same flight search refreshed by
many users.

Apisix Cache puts a caching gateway between your applications and those APIs:

- **Identical requests are answered from cache** and never reach the paid
  upstream.
- **Noise is ignored.** Fields such as `requestId` or `timestamp` would make
  every request look unique; you pick only the fields that matter, so
  "different but equivalent" requests share one cache entry.
- **Cache stampedes are prevented.** When an entry expires, only one request
  goes to the upstream while the rest wait for its answer.

Depending on how repetitive your traffic is, this can cut upstream calls, and
the bill that comes with them, by **70% or more**.

## ✨ Features

This is the **open-source, single-tenant** edition.

| | |
|---|---|
| 🧩 **Cache rules → APISIX routes** | Each rule defines an endpoint pattern, HTTP methods and an upstream URL, and is pushed to APISIX as a route. |
| ⏱️ **Per-rule TTL** | From 1 second up to 1 year. |
| 🎯 **Body / query normalization** | The cache key is built only from the query and JSON body fields you choose. |
| 🔒 **Cache lock (single flight)** | Stops a thundering herd from reaching the upstream on a cache miss. |
| 🚦 **Rate limiting** | Optional per-client-IP limit in requests per second (`429` when exceeded). |
| 🧹 **One-click purge** | Invalidate every cached entry of a rule at once, on every gateway node (generation-based). |
| 📊 **Hit / miss dashboard** | The gateway buffers cache status in shared memory and reports it to the control plane in batches. |
| 🗄️ **SQLite** | A single file with nothing to configure. |
| 🐳 **One-command setup** | `docker compose up` starts etcd, APISIX and the control plane. |

## 🧱 Architecture

```text
                         ┌───────────────────────────── data plane ─────────────────────────────┐
                         │                                                                      │
 [Client app] ─────────► │  APISIX :9080                                                        │
       ▲                 │   ├─ cache-normalizer  → $normalized_cache_key + $cache_generation   │
       │                 │   ├─ limit-req         → optional rate limit                         │
       │                 │   └─ proxy-cache       → disk cache ──(miss)──► External API         │
       │   HIT / MISS    │                                               (Google Maps, …)       │
       └──────────────── │                                                                      │
                         └───────────▲───────────────────────────────┬──────────────────────────┘
                                     │ Admin API :9180                │ batched hit/miss
                                     │ (routes, plugins)              ▼ reports (every 5 s)
 [Browser] ────────────────────────► AdonisJS control plane :3333 + SQLite
                                     (rules, TTL, purge, stats)
```

| Layer | Tech | Role |
|---|---|---|
| **Data plane** | Apache APISIX 3.10 + etcd + OpenResty/LuaJIT | Routing, caching, rate limiting |
| **Custom plugin** | `cache-normalizer` (Lua) | Deterministic cache key, hit/miss reporting |
| **Control plane** | AdonisJS 7 (TypeScript) + SQLite | Admin UI, cache rules, purge, stats |

## 🚀 Quick start

**Requirements:** Docker and Docker Compose v2.

```bash
git clone https://github.com/halityurttas/apisixcache.git
cd apisixcache

# Optional: override the defaults
export ADMIN_EMAIL=admin@example.com
export ADMIN_PASSWORD=change-me-please
export APISIX_ADMIN_KEY=$(openssl rand -hex 16)

docker compose up --build
```

On first boot the app container runs the database migrations and seeds the
admin account. Both steps are idempotent, so restarting is safe.

`APISIX_ADMIN_KEY` is passed to both APISIX (`config.yaml` reads it from the
environment) and the control plane, so the two sides always use the same key.

| Service | URL |
|---|---|
| Control plane (UI) | http://localhost:3333 |
| APISIX gateway (send your API traffic here) | http://localhost:9080 |
| APISIX Admin API (host-local only) | http://127.0.0.1:9181 |

The Admin API (container port `9180`) and etcd (`2379`) are bound to
`127.0.0.1` only. Port `9181` is used on the host because `9180` is often
already taken.

> If you did not set `ADMIN_PASSWORD`, the default Docker login is
> `admin@example.com` / `admin12345`. Change it before exposing the service.

## 🧪 Your first cache rule

Open http://localhost:3333, log in, then go to **Rules → Create** and fill in:

| Field | Example | Meaning |
|---|---|---|
| **Name** | `Google Geocoding` | Display name |
| **Endpoint pattern** | `/maps/api/geocode/json` | Path the gateway listens on (APISIX URI syntax, e.g. `/api/*`) |
| **Upstream URL** | `https://maps.googleapis.com` | Where cache misses are forwarded |
| **Methods** | `GET` | Methods that are proxied and cached |
| **TTL (seconds)** | `2592000` | 30 days |
| **Query fields** | `address` | Only these query parameters form the cache key |
| **Allowed body fields** | *(empty)* | Same idea for JSON bodies (useful for `POST` search APIs) |
| **Cache lock** | ✅ | One upstream request per cache miss |
| **Rate limit (req/s)** | *(empty)* | Leave empty to disable |

Save it. The rule is pushed to APISIX straight away. Now send traffic through
the gateway:

```bash
# 1st call → MISS (goes to Google)
curl -i "http://localhost:9080/maps/api/geocode/json?address=Istanbul&key=YOUR_KEY"

# 2nd call → HIT (served from cache, Google is never called)
curl -i "http://localhost:9080/maps/api/geocode/json?address=Istanbul&key=YOUR_KEY"
```

Look at the `Apisix-Cache-Status` response header (`MISS` → `HIT`). The
**Dashboard** shows the hit/miss counters for each rule.

## 🔍 How it works

### Request flow

1. The control plane turns every active rule into an APISIX route (ID
   `cache-rule-<id>`) with up to three plugins:
   - **`cache-normalizer`** (custom Lua, priority 2500): reads the query
     string and/or JSON body, keeps only the configured fields, sorts them
     and produces a deterministic `$normalized_cache_key`. It also exposes
     the rule's `$cache_generation`.
   - **`limit-req`**: optional per-IP rate limiting (burst = 2 × rate).
   - **`proxy-cache`**: disk cache using the key
     `["$uri", "$normalized_cache_key", "$cache_generation"]`. Status codes
     `200`, `301` and `302` are cached.
2. On a **cache miss** with cache lock enabled, only one request reaches the
   upstream. The others wait and receive the same response.
3. In the `log` phase the normalizer increments a `<rule_id>:<status>`
   counter in the `stats_buffer` shared dict (no network call on the request
   path). A timer in each worker flushes the counters every 5 seconds as one
   batched `POST /api/stats/ingest` (authenticated with `X-Stats-Token`).
   `STALE`/`UPDATING` count as hits; `EXPIRED`/`BYPASS` count as misses.

### Normalization example

With **Allowed body fields** set to `origin, destination, date`, these two
requests share **one** cache entry:

```jsonc
{ "origin": "IST", "destination": "LHR", "date": "2026-10-01", "requestId": "a1b2", "ts": 1759000000 }
{ "date": "2026-10-01", "destination": "LHR", "origin": "IST", "requestId": "z9y8", "ts": 1759000042 }
```

Leave the field lists empty to use the full query string or body.

### Purging

The **Purge** button invalidates **every** cached entry of a rule at once. It
does not delete anything. Instead it:

1. increments the rule's `generation` column,
2. re-syncs the route, so the new value reaches every APISIX node through
   etcd.

Because `$cache_generation` is part of the cache key, all old entries (every
query/body combination) stop matching immediately and the next request is a
`MISS`. The old files stay on disk until their TTL expires or the cache
zone's size limit evicts them.

A few details:

- **`$host` is left out of the cache key on purpose**, so clients reaching
  the gateway under different hostnames (public host vs. `apisix:9080`
  inside Docker) share the same entries.
- The route still accepts `PURGE` on top of the rule's methods. Use it to
  remove **one** entry by sending the same query/body as the cached request:

  ```bash
  curl -i -X PURGE "http://localhost:9080/maps/api/geocode/json?address=Istanbul"
  # 200 = entry removed, 404 = nothing was cached for that key
  ```

### Enabling, disabling, deleting

- Turning a rule **inactive** deletes its route from APISIX. Traffic to that
  path is then no longer proxied.
- **Deleting** a rule removes both the route and the database record.

> **Note:** APISIX does not cache responses that set cookies or are marked
> `private`/`no-store`. Use this for JSON pay-per-call API endpoints
> (GET/POST), not for browser session pages.

## 🔧 Configuration

All settings come from environment variables (see [.env.example](.env.example)).

| Variable | Default (Docker) | Description |
|---|---|---|
| `APP_KEY` | built-in dev key | Encryption key for sessions. **Generate your own** (`node ace generate:key`). |
| `ADMIN_EMAIL` | `admin@example.com` | Email of the seeded admin account |
| `ADMIN_PASSWORD` | `admin12345` | Password of the seeded admin account |
| `SESSION_SECURE` | `false` | Set to `true` only when the UI is served over HTTPS |
| `APISIX_ADMIN_API_URL` | `http://apisix:9180/apisix/admin` | APISIX Admin API base URL |
| `APISIX_ADMIN_KEY` | APISIX default key | Admin API key, shared by APISIX and the control plane. **Set your own.** |
| `APISIX_GATEWAY_URL` | `http://apisix:9080` | Gateway base URL (required by the env schema; not used by purge any more) |
| `STATS_INGEST_URL` | `http://app:3333/api/stats/ingest` | Where the gateway sends hit/miss reports |
| `STATS_INGEST_TOKEN` | `oss-stats-token` | Shared secret for the stats endpoint |
| `PORT` / `HOST` | `3333` / `0.0.0.0` | HTTP listen address of the control plane |
| `LOG_LEVEL` | `info` | Pino log level |

[docker/apisix/config.yaml](docker/apisix/config.yaml) defines two things:

- the disk cache zone `disk_cache_one`: 50 MB of keys in memory, 2 GB on disk,
  stored in the `apisix-cache-data` volume,
- the `stats_buffer` shared dict (10 MB) that buffers telemetry.

## 💻 Local development

Run the control plane on your machine and keep APISIX + etcd in Docker:

```bash
# 1. Start only the data plane
docker compose up -d etcd apisix

# 2. Set up the control plane (Node.js >= 24)
npm install
cp .env.example .env
node ace generate:key       # writes APP_KEY into .env
node ace migration:run
node ace db:seed

# 3. Start with hot reload
npm run dev                 # http://localhost:3333
```

> When the control plane runs on the host, the gateway (inside Docker) cannot
> reach `localhost:3333`. Point `STATS_INGEST_URL` at
> `http://host.docker.internal:3333/api/stats/ingest` if you want dashboard
> stats during development.

| Script | Description |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production build into `build/` |
| `npm start` | Run the production build |
| `npm test` | Run the test suite (Japa) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run typecheck` | TypeScript type check |

## 📁 Project structure

```text
.
├── app/
│   ├── controllers/        # Session, dashboard, cache rules, stats ingest
│   ├── models/             # User, CacheRule, CacheStat (Lucid ORM)
│   ├── services/
│   │   └── apisix_service.ts   # The only bridge to the APISIX Admin API
│   └── validators/         # VineJS validation for cache rules
├── database/
│   ├── migrations/         # users, cache_rules (+ generation), cache_stats
│   └── seeders/            # Seeds the single admin account
├── docker/
│   ├── apisix/
│   │   ├── config.yaml                     # APISIX config (cache zone, admin key, plugins)
│   │   └── custom-plugins/cache-normalizer.lua
│   └── app/                # Control plane image + entrypoint (migrate, seed, start)
├── resources/views/        # Edge templates (Alpine.js)
├── start/routes.ts         # HTTP routes
└── docker-compose.yml      # etcd + APISIX + control plane
```

## 🔐 Production checklist

The default settings are meant for **local evaluation only**. Before you
expose this anywhere:

- [ ] Generate a new **`APP_KEY`** (`node ace generate:key`).
- [ ] Change **`ADMIN_PASSWORD`** to a strong password.
- [ ] Set **`APISIX_ADMIN_KEY`**. The fallback value is APISIX's publicly
      known default key.
- [ ] Keep the Admin API and etcd off the public network. Compose binds them
      to `127.0.0.1`, and `allow_admin` only accepts `172.16.0.0/12` (the
      Docker network). Adjust both if your network layout differs.
- [ ] Set a random **`STATS_INGEST_TOKEN`**.
- [ ] Put the UI behind HTTPS and set `SESSION_SECURE=true`.
- [ ] Back up `./data` (SQLite database) and size the cache disk to your needs.

## 🩺 Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| *"Rule saved locally, but syncing to APISIX failed"* | APISIX is not reachable or the admin key does not match. Check `APISIX_ADMIN_API_URL` / `APISIX_ADMIN_KEY` and `docker compose logs apisix`. |
| Always `MISS`, never `HIT` | The upstream sets cookies or `Cache-Control: private/no-store`, returns a non-cacheable status, or a changing field (timestamp, request ID) is part of the key. Restrict the key with query/body fields. |
| *"Purge failed"* | The control plane could not re-sync the route. Check the APISIX admin connection (same as above). |
| Manual `PURGE` returns `404` | Nothing was cached for that exact key. Send the same query/body as the cached request. |
| Dashboard counters stay at 0 | Counters are flushed every 5 s, so wait a moment. Otherwise the gateway cannot reach `STATS_INGEST_URL`, `STATS_INGEST_TOKEN` differs between the two sides, or `stats_buffer` is missing from `config.yaml` (see `docker compose logs apisix`). |
| `429 Too Many Requests` | The rule's rate limit was exceeded. Raise or clear **Rate limit (req/s)**. |
| Upstream receives the wrong `Host` header | Routes use `pass_host: node`, so the upstream host is taken from the Upstream URL. Make sure it is the real API host. |

## ❓ FAQ

**Does it work with `POST` APIs?**
Yes. Select `POST` as a method and list the relevant JSON body fields. The
key is built from those fields only.

**Is the API key in my query string part of the cache key?**
Only if you leave **Query fields** empty (the full query string is used) or
list it explicitly. Listing only the business fields (e.g. `address`) lets
all clients share cached answers.

**Can I use internal upstreams like `http://api.internal:8080`?**
Yes. Hostnames without a TLD are accepted.

**Where is the cache stored?**
At `/tmp/disk_cache_one` inside the APISIX container, backed by the
`apisix-cache-data` Docker volume, so it survives container re-creation.
`docker compose down -v` removes it.

## 🆚 OSS vs PRO

| | OSS (this repo) | PRO / Enterprise |
|---|---|---|
| Database | SQLite | PostgreSQL + Redis |
| Tenancy | Single admin | Multi-tenant, self-service portal |
| Normalization | Body/query field selection | Geo-precision rounding, custom hash |
| Limits | Basic rate limit | Per-tenant quota + billing |
| HA | Single node | Multi-node cluster + HA etcd |
| Analytics | Hit/miss counters | Cost-savings reports, exports |

## 🤝 Contributing

Issues and pull requests are welcome.

1. Fork the repository and create a feature branch.
2. Run `npm run lint`, `npm run typecheck` and `npm test` before you push.
3. Describe **what** you changed and **why** in the pull request.

Unless you state otherwise, any contribution you submit is licensed under
Apache-2.0, as described in section 5 of the license.

## 📄 License

Licensed under the [Apache License, Version 2.0](LICENSE). See also
[NOTICE](NOTICE).

```text
Copyright 2026 The Apisix Cache Authors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

Apache®, Apache APISIX® and the APISIX logo are trademarks of The Apache
Software Foundation. This project is not affiliated with or endorsed by The
Apache Software Foundation.

## ☁️ SaaS / Partnership

A hosted **SaaS** edition of Apisix Cache is available. If you are interested
in the SaaS version, or would like to become a business partner or reseller,
get in touch at **halityurttas@gmail.com**.
