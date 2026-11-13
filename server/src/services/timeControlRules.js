// @ts-check
/**
 * The time-control model as the entry adapters see it. Socket and HTTP
 * schemas validate at the boundary (NODE-08) but may not import `domain/`
 * directly (entry adapters call services only), so the two rules they need
 * are exposed here unchanged.
 */
const { isValidTimeControl, normalizeTimeControl } = require('../domain/timeControl');

module.exports = { isValidTimeControl, normalizeTimeControl };
