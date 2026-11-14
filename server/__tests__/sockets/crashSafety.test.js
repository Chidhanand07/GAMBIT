/**
 * Regression [S15]: hostile payloads through the real server must not produce
 * an unhandled rejection (Node ≥ 15 exits on one) (NODE-07, NODE-08).
 */
jest.mock('../../supabase', () => ({ supabase: require('../helpers/mockSupabase').createSupabaseMock() }));
jest.mock('../../lib/redis', () => require('../helpers/mockRedis').createRedisMock());
jest.mock('../../services/rating', () => ({ processGameEnd: jest.fn(async () => null) }));

const { useServer, sleep } = require('../characterization/harness');

const ctx = useServer();

/** Emit with an ack callback and resolve with what the server acknowledged. */
const emitAck = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));

const HOSTILE = [
    ['make_move', null],
    ['make_move', 'e2e4'],
    ['make_move', { game_id: { $ne: null } }],
    ['resign', { game_id: 123 }],
    ['resign', null],
    ['send_message', null],
    ['join_queue', 7],
    ['rematch_request', null],
    ['challenge_request', []],
    ['join_game', { id: 'g1' }],
];

test.each(HOSTILE)('%s with %j is acked as invalid_payload and nothing is thrown', async (event, payload) => {
    const rejections = [];
    const onRejection = (reason) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);
    try {
        const socket = await ctx.connect('mallory');
        expect(await emitAck(socket, event, payload)).toEqual({ ok: false, error: 'invalid_payload' });
        await sleep(30);
        expect(rejections).toEqual([]);
    } finally {
        process.off('unhandledRejection', onRejection);
    }
});
