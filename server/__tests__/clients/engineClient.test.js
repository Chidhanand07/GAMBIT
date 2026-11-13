/**
 * server/src/clients/engineClient.js — same URL, method, headers and body as
 * the inline fetch calls it replaced; global fetch resolved per call.
 */
const { createEngineClient } = require('../../src/clients/engineClient');

let baseUrl;
let sharedSecret;
let client;
beforeEach(() => {
    baseUrl = 'http://engine.one';
    sharedSecret = 'engine-secret';
    client = createEngineClient({ baseUrl: () => baseUrl, sharedSecret: () => sharedSecret });
});
afterEach(() => jest.restoreAllMocks());

function expectPost(fetchSpy, url, body) {
    expect(fetchSpy).toHaveBeenCalledWith(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Engine-Key': 'engine-secret' },
        body: JSON.stringify(body),
    });
}

test('validateMove posts { fen, move } and returns the raw response', async () => {
    const response = { ok: true };
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(response);
    await expect(client.validateMove({ fen: 'F', move: 'e2e4' })).resolves.toBe(response);
    expectPost(spy, 'http://engine.one/validate-move', { fen: 'F', move: 'e2e4' });
});

test('analyseGame posts { game_id, pgn, time_control } in that key order', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true });
    await client.analyseGame({ gameId: 'g1', pgn: '1. e4', timeControl: '10' });
    expect(spy.mock.calls[0][1].body).toBe('{"game_id":"g1","pgn":"1. e4","time_control":"10"}');
    expectPost(spy, 'http://engine.one/analyse-game', { game_id: 'g1', pgn: '1. e4', time_control: '10' });
});

test('analyzePosition posts { fen, depth }', async () => {
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true });
    await client.analyzePosition({ fen: 'F', depth: 18 });
    expectPost(spy, 'http://engine.one/analyze', { fen: 'F', depth: 18 });
});

test('base URL and global fetch are both resolved at call time', async () => {
    const first = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true });
    await client.analyzePosition({ fen: 'F', depth: 1 });
    first.mockRestore();

    baseUrl = 'http://engine.two';
    const second = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false });
    await client.analyzePosition({ fen: 'F', depth: 1 });
    expect(second).toHaveBeenCalledWith('http://engine.two/analyze', expect.any(Object));
});

test('rejections propagate unchanged', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(client.validateMove({ fen: 'F', move: 'x' })).rejects.toThrow('ECONNREFUSED');
});

describe('X-Engine-Key [ENG-AUTH]', () => {
    test.each([
        ['validateMove', (c) => c.validateMove({ fen: 'F', move: 'e2e4' })],
        ['analyseGame', (c) => c.analyseGame({ gameId: 'g1', pgn: '1. e4', timeControl: '10' })],
        ['analyzePosition', (c) => c.analyzePosition({ fen: 'F', depth: 18 })],
    ])('%s sends the shared secret', async (_name, call) => {
        const spy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true });
        await call(client);
        expect(spy.mock.calls[0][1].headers['X-Engine-Key']).toBe('engine-secret');
    });

    test('the secret is read at call time (rotation does not need a restart of the client)', async () => {
        const spy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true });
        sharedSecret = 'rotated';
        await client.analyzePosition({ fen: 'F', depth: 1 });
        expect(spy.mock.calls[0][1].headers['X-Engine-Key']).toBe('rotated');
    });

    test.each([[undefined], ['']])('without a secret (%p) no request is sent at all', async (value) => {
        const spy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true });
        sharedSecret = value;
        await expect(client.analyzePosition({ fen: 'F', depth: 1 })).rejects.toThrow('ENGINE_SHARED_SECRET is not set');
        await expect(client.analyseGame({ gameId: 'g', pgn: 'p', timeControl: '10' })).rejects.toThrow(
            'ENGINE_SHARED_SECRET is not set',
        );
        expect(spy).not.toHaveBeenCalled();
    });
});

describe('X-Request-Id [OBSERVABILITY]', () => {
    const { runWithRequestId } = require('../../src/observability/requestContext');

    test('during an HTTP request the request id goes to the engine', async () => {
        const spy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true });
        await runWithRequestId('req-42', () => client.analyzePosition({ fen: 'F', depth: 10 }));
        expect(spy.mock.calls[0][1].headers).toEqual({
            'Content-Type': 'application/json',
            'X-Engine-Key': 'engine-secret',
            'X-Request-Id': 'req-42',
        });
    });

    test('outside a request (socket events, the clock) no request id header is sent', async () => {
        const spy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true });
        await client.analyzePosition({ fen: 'F', depth: 10 });
        expect(spy.mock.calls[0][1].headers).not.toHaveProperty('X-Request-Id');
    });
});
