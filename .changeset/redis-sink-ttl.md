---
"@adonis-agora/agent": patch
---

Redis token-stream sink: expire a run's replay keys instead of leaking them.

The framework never calls the sink's `close()`, so the Redis multi-replica sink's per-run `chunks`/`state` keys accumulated forever. They now get a TTL (default **1h**, sliding window refreshed on every write — so a long run stays alive and a crashed run that never `end`s still expires). Configurable via `tokenSinks.redis({ ttlSeconds })`; set `0` to keep the previous retain-forever behaviour. Adds an optional `expire(key, seconds)` to the `RedisStreamClient` interface (the `@adonisjs/redis` adapter implements it; a bring-your-own client that omits it keeps working, just without the TTL).
