/**
 * server/src/clients/engineClient.js — same URL, method, headers and body as
 * the inline fetch calls it replaced; global fetch resolved per call.
 */
const { createEngineClient } = require('../../src/clients/engineClient');

let baseUrl;
let client;
beforeEach(() => {
    baseUrl = 'http://engine.one';
    client = createEngineClient({ baseUrl: () => baseUrl });
});
afterEach(() => jest.restoreAllMocks());

function expectPost(fetchSpy, url, body) {
    expect(fetchSpy).toHaveBeenCalledWith(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
