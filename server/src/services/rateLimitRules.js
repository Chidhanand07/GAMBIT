// @ts-check
/**
 * The rate-limit rules as the entry adapters see them: socket and HTTP
 * middleware may not import `domain/` directly (dependency-cruiser), so the
 * two lookups they need are exposed here unchanged.
 */
const { RULES, socketRuleFor, httpRuleFor } = require('../domain/rateLimits');

module.exports = { RULES, socketRuleFor, httpRuleFor };
