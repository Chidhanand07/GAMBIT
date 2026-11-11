/**
 * src/services/emitter.js and src/sockets/sessionRegistry.js.
 */
const { createIoEmitter, gameRoom, userRoom } = require('../../src/services/emitter');
const { createSessionRegistry } = require('../../src/sockets/sessionRegistry');
const { makeIo } = require('../helpers/fixtures');

describe('createIoEmitter', () => {
    test('toRoom is io.to(room).emit(event, payload)', () => {
        const io = makeIo();
        createIoEmitter(io).toRoom('game_1', 'move_made', { a: 1 });
        expect(io.to).toHaveBeenCalledWith('game_1');
        expect(io.emitted).toEqual([{ room: 'game_1', event: 'move_made', payload: { a: 1 } }]);
    });

    test('toAll is io.emit(event, payload)', () => {
        const io = makeIo();
        createIoEmitter(io).toAll('queue_status', { players_searching: 0 });
        expect(io.emit).toHaveBeenCalledWith('queue_status', { players_searching: 0 });
    });

    test('a payload-less event stays payload-less (no trailing undefined argument)', () => {
        const emit = jest.fn();
        createIoEmitter({ to: () => ({ emit }), emit: jest.fn() }).toRoom('user_u', 'rematch_declined');
        expect(emit.mock.calls[0]).toEqual(['rematch_declined']);
    });

    test('room names', () => {
        expect(gameRoom('g')).toBe('game_g');
        expect(userRoom('u')).toBe('user_u');
    });
});

describe('createSessionRegistry', () => {
    test('register / userIdOf / unregister', () => {
        const s = createSessionRegistry();
        s.register('u1', 's1');
        expect(s.userIdOf('s1')).toBe('u1');
        expect(s.unregister('s1')).toBe('u1');
        expect(s.userIdOf('s1')).toBeUndefined();
        expect(s.unregister('unknown')).toBeUndefined();
    });

    test('active games survive unregister and are cleared per game', () => {
        const s = createSessionRegistry();
        s.register('u1', 's1');
        s.setActiveGame('u1', 'g1');
        s.setActiveGame('u2', 'g1');
        s.setActiveGame('u3', 'g2');
        s.unregister('s1');
        expect(s.hasActiveGame('u1')).toBe(true);
        s.clearGame('g1');
        expect(s.hasActiveGame('u1')).toBe(false);
        expect(s.hasActiveGame('u2')).toBe(false);
        expect(s.activeGameOf('u3')).toBe('g2');
    });
});
