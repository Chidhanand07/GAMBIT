/**
 * Two Socket.IO servers sharing one Redis through the Redis Streams adapter [MULTI-INSTANCE]
 * (NODE-15). A room emit or a fetchSockets on one instance reaches sockets held by the other.
 * Runs against a real Redis when one is available.
 */
const http = require('node:http');
const ioClient = require('socket.io-client');
const { createSocketServer } = require('../../src/sockets');
const { createSocketAdapter } = require('../../src/clients/socketAdapter');
const { startRealRedis } = require('../helpers/realRedis');

let redisServer;
const closers = [];
const allowAll = () => ({ isAllowed: () => true, allowsRequest: () => true });

beforeAll(async () => {
    redisServer = await startRealRedis();
});
afterAll(async () => {
    for (const close of closers.reverse()) await close();
    await redisServer?.stop();
});

async function instance() {
    const adapter = createSocketAdapter(redisServer.url);
    const server = http.createServer();
    const io = createSocketServer(server, allowAll, { adapter: adapter.adapter });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    closers.push(async () => {
        io.close();
        await adapter.close();
    });
    return { io, url: `http://127.0.0.1:${server.address().port}` };
}

const connect = (url, transports = ['websocket']) =>
    new Promise((resolve, reject) => {
        const socket = ioClient(url, { transports, forceNew: true, reconnection: false });
        closers.push(async () => socket.disconnect());
        socket.on('connect', () => resolve(socket));
        socket.on('connect_error', reject);
    });

const maybe = (name, fn) =>
    test(name, async () => {
        if (!redisServer) {
            console.warn(`skipped (no redis-server binary and no REDIS_TEST_URL): ${name}`);
            return;
        }
        await fn();
    }, 15000);

maybe('a room emit on instance A reaches a socket connected to instance B; fetchSockets sees it', async () => {
    const a = await instance();
    const b = await instance();
    b.io.on('connection', (s) => s.join('game_g1'));
    const client = await connect(b.url);
    await new Promise((r) => setTimeout(r, 200));

    const received = new Promise((resolve) => client.once('move_made', resolve));
    a.io.to('game_g1').emit('move_made', { san: 'e4' });
    expect(await received).toEqual({ san: 'e4' });
    expect(await a.io.in('game_g1').fetchSockets()).toHaveLength(1);
});

maybe('the server accepts WebSocket only: no long-polling, so no sticky sessions are needed', async () => {
    const a = await instance();
    await expect(connect(a.url, ['polling'])).rejects.toBeTruthy();
    await expect(connect(a.url, ['websocket'])).resolves.toBeTruthy();
});
