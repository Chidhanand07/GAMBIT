// @ts-check
/**
 * Operational errors (NODE-07): a failure the caller can be told about, with a
 * stable code and the HTTP status that fits it. Services throw these; the HTTP
 * layer turns them into a response (http/respond.js). Anything else that is
 * thrown is a bug or an unknown failure and is answered with a generic 500;
 * its message is logged, never sent to the client.
 */
class AppError extends Error {
    /**
     * @param {string} code stable, machine-readable (sent to the client as `error`)
     * @param {number} httpStatus
     * @param {string} [message] for the log; defaults to the code
     */
    constructor(code, httpStatus, message) {
        super(message ?? code);
        this.name = 'AppError';
        this.code = code;
        this.httpStatus = httpStatus;
    }
}

module.exports = { AppError };
