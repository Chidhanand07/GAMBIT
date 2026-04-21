const Redis = require('ioredis')

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    retryStrategy: (times) => {
        if (times > 3) {
            console.error('[Redis] Connection failed after 3 retries — game state will use Supabase fallback')
            return null
        }
        return Math.min(times * 200, 2000)
    },
    lazyConnect: true,
    maxRetriesPerRequest: 2,
})

redis.on('connect', () => console.log('[Redis] Connected'))
redis.on('error', (err) => console.error('[Redis] Error:', err.message))

module.exports = redis
