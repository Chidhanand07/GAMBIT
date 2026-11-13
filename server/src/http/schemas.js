// @ts-check
/**
 * One zod schema per HTTP input (NODE-08): bounded, typed, unknown keys dropped.
 */
const { z } = require('zod');

const MAX_FEN_LENGTH = 100;
const MIN_DEPTH = 1;
const MAX_DEPTH = 30;
const MAX_USERNAME_LENGTH = 64;

const schemas = {
    /** POST /api/analysis/engine */
    analysis: z.object({
        fen: z.string().min(1).max(MAX_FEN_LENGTH),
        depth: z.number().int().min(MIN_DEPTH).max(MAX_DEPTH).optional(),
    }),
    /** GET /api/users/check-username?u= */
    usernameQuery: z.object({ u: z.string().min(1).max(MAX_USERNAME_LENGTH) }),
};

module.exports = { schemas };
