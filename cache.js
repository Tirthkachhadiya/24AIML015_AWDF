/**
 * cache.js — Practical 9: In-Memory Caching Module
 *
 * Initializes a shared NodeCache instance used across the entire API.
 *
 * Configuration:
 *   stdTTL  : 60 seconds — cached responses expire automatically after 1 minute.
 *             Avoids indefinitely stale data even if a write operation is missed.
 *   checkperiod: 10 seconds — background sweep to evict expired keys.
 *   useClones: false — return references instead of deep clones for speed
 *              (safe here because we always replace, never mutate cached objects).
 *
 * Cache Keys Used:
 *   'all_tasks'       → GET /tasks   (all tasks list)
 *   'task_<id>'       → GET /tasks/:id (single task — Supplementary Problem)
 *
 * Invalidation Strategy:
 *   Write operations (POST/PUT/DELETE) call cache.del() or cache.flushAll()
 *   AFTER successfully committing the change to MongoDB. This ensures that:
 *   1. The cache never holds stale data longer than one write cycle.
 *   2. The next GET request re-populates from the fresh database state.
 *
 * Known Limitation (documented for lab journal):
 *   node-cache is process-local (stored in Node.js heap memory).
 *   If the app runs across multiple server instances (horizontal scaling),
 *   each instance has its own independent cache — a write on server A does
 *   NOT invalidate the cache on server B. This is why production systems
 *   use a shared external cache like Redis instead.
 */
const NodeCache = require('node-cache');

const cache = new NodeCache({
  stdTTL:      60,   // default TTL: 60 seconds
  checkperiod: 10,   // sweep expired keys every 10 seconds
  useClones:   false // return references for performance
});

/**
 * Supplementary Problem: Cache Hit/Miss Counter
 * Tracks how many times the cache returned a hit vs miss since last server restart.
 * Exposed via GET /cache/stats debug endpoint.
 */
const cacheStats = {
  hits:   0,
  misses: 0,
  invalidations: 0,

  recordHit()          { this.hits++;          },
  recordMiss()         { this.misses++;         },
  recordInvalidation() { this.invalidations++;  },

  getStats() {
    const total = this.hits + this.misses;
    return {
      hits:          this.hits,
      misses:        this.misses,
      invalidations: this.invalidations,
      total_requests: total,
      hit_rate:      total > 0 ? `${((this.hits / total) * 100).toFixed(1)}%` : '0%',
      current_keys:  cache.keys(),
      ttl_seconds:   60,
      note:          'Counters reset on server restart (in-memory only)'
    };
  },

  reset() {
    this.hits = 0;
    this.misses = 0;
    this.invalidations = 0;
  }
};

module.exports = { cache, cacheStats };
