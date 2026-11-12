/**
 * src/services/profileService.js and src/services/analysisService.js [G14] (SEC-09, NODE-07).
 * A dependency that fails is an error with a status, never a made-up success.
 */
const { createProfileService } = require('../../src/services/profileService');
const { createAnalysisService } = require('../../src/services/analysisService');
const { AppError } = require('../../src/services/errors');
const { result } = require('./fakes');

/** The AppError a promise rejects with, as { code, httpStatus }. */
async function failure(promise) {
    const error = await promise.then(
        () => null,
        (e) => e,
    );
    expect(error).toBeInstanceOf(AppError);
    return { code: error.code, httpStatus: error.httpStatus };
}

describe('isUsernameAvailable', () => {
    test('no row → true, a row → false', async () => {
        const profilesRepo = { findUsernameByUsername: jest.fn(() => result(null)) };
        const svc = createProfileService({ profilesRepo });
        expect(await svc.isUsernameAvailable('new')).toBe(true);
        profilesRepo.findUsernameByUsername.mockReturnValue(result({ username: 'bob' }));
        expect(await svc.isUsernameAvailable('bob')).toBe(false);
        expect(profilesRepo.findUsernameByUsername).toHaveBeenLastCalledWith('bob');
    });

    test('a database error is NOT "available": it fails closed with 503 [G14]', async () => {
        const profilesRepo = { findUsernameByUsername: jest.fn(() => result(null, { message: 'db down' })) };
        const svc = createProfileService({ profilesRepo });
        expect(await failure(svc.isUsernameAvailable('bob'))).toEqual({ code: 'username_check_unavailable', httpStatus: 503 });
    });

    test('a lookup that throws fails closed the same way', async () => {
        const profilesRepo = {
            findUsernameByUsername: jest.fn(() => {
                throw new Error('client exploded');
            }),
        };
        const svc = createProfileService({ profilesRepo });
        expect(await failure(svc.isUsernameAvailable('bob'))).toEqual({ code: 'username_check_unavailable', httpStatus: 503 });
    });
});

describe('analysePosition', () => {
    const engine = (response) => ({ analyzePosition: jest.fn(async () => response) });
    const ok = (body) => ({ ok: true, status: 200, json: async () => body });
    const notOk = (status, body = { detail: 'x' }) => ({ ok: false, status, json: async () => body });

    test('default depth 18; the engine body is returned when the engine says OK', async () => {
        const engineClient = engine(ok({ best_move: 'e2e4', score: 0.3 }));
        const svc = createAnalysisService({ engineClient });
        expect(await svc.analysePosition({ fen: 'F' })).toEqual({ best_move: 'e2e4', score: 0.3 });
        expect(engineClient.analyzePosition).toHaveBeenCalledWith({ fen: 'F', depth: 18 });
        await svc.analysePosition({ fen: 'F', depth: 12 });
        expect(engineClient.analyzePosition).toHaveBeenLastCalledWith({ fen: 'F', depth: 12 });
    });

    test.each([
        [400, 'engine_rejected', 400],
        [422, 'engine_rejected', 400],
        [404, 'engine_rejected', 400],
        [401, 'engine_unavailable', 502], // our own key was refused: a server problem, not the caller's
        [403, 'engine_unavailable', 502],
        [429, 'engine_busy', 503],
        [503, 'engine_busy', 503],
        [500, 'engine_unavailable', 502],
        [502, 'engine_unavailable', 502],
    ])('engine status %i → %s (HTTP %i), never a 200 with an error body [G14]', async (status, code, httpStatus) => {
        const svc = createAnalysisService({ engineClient: engine(notOk(status)) });
        expect(await failure(svc.analysePosition({ fen: 'F' }))).toEqual({ code, httpStatus });
    });

    test('engine unreachable → engine_unavailable (502)', async () => {
        const engineClient = { analyzePosition: jest.fn(async () => Promise.reject(new Error('ECONNREFUSED'))) };
        const svc = createAnalysisService({ engineClient });
        expect(await failure(svc.analysePosition({ fen: 'F' }))).toEqual({ code: 'engine_unavailable', httpStatus: 502 });
    });

    test('an OK status with an unparseable body → engine_unavailable (502)', async () => {
        const engineClient = engine({
            ok: true,
            status: 200,
            json: async () => {
                throw new SyntaxError('Unexpected token <');
            },
        });
        const svc = createAnalysisService({ engineClient });
        expect(await failure(svc.analysePosition({ fen: 'F' }))).toEqual({ code: 'engine_unavailable', httpStatus: 502 });
    });
});
