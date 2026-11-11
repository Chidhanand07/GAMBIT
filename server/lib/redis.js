const env = require('../src/config/env')
const { createRedisClient } = require('../src/clients/redisClient')

// Legacy seam: tests jest.mock('../lib/redis'); src/ obtains the client through this path.
const redis = createRedisClient(env.redisUrl())

module.exports = redis
