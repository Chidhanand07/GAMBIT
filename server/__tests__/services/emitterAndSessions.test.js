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
        expect(s.unregister('s1')).toEqual({ userId: 'u1', orphanedGames: [] });
        expect(s.userIdOf('s1')).toBeUndefined();
        expect(s.unregister('unknown')).toEqual({ userId: undefined, orphanedGames: [] });
    });

    test('the user-level link (which game to resume) survives a disconnect and is cleared per game', () => {
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

    describe('a player with several sockets [MULTI-SOCKET]', () => {
        /** u1 has two tabs on game g1 and one tab that is only in the lobby. */
        function threeTabs() {
            const s = createSessionRegistry();
            for (const id of ['tab-a', 'tab-b', 'lobby']) s.register('u1', id);
            s.linkSocket('tab-a', 'g1');
            s.linkSocket('tab-b', 'g1');
            return s;
        }

        test('closing one of two game tabs orphans nothing: the player is still at the board', () => {
            const s = threeTabs();
            expect(s.unregister('tab-a')).toEqual({ userId: 'u1', orphanedGames: [] });
            expect(s.socketsInGame('u1', 'g1')).toBe(1);
        });

        test('closing the last game tab orphans the game, even though a lobby tab is still open', () => {
            const s = threeTabs();
            s.unregister('tab-a');
            expect(s.unregister('tab-b')).toEqual({ userId: 'u1', orphanedGames: ['g1'] });
            expect(s.socketsInGame('u1', 'g1')).toBe(0);
        });

        test('a socket that never joined a game orphans nothing when it goes', () => {
            const s = threeTabs();
            expect(s.unregister('lobby')).toEqual({ userId: 'u1', orphanedGames: [] });
        });

        test('linking a socket also records the game as the one to resume', () => {
            const s = threeTabs();
            expect(s.activeGameOf('u1')).toBe('g1');
        });

        test("another player's sockets do not keep my game alive", () => {
            const s = createSessionRegistry();
            s.register('u1', 'mine');
            s.register('u2', 'theirs');
            s.linkSocket('mine', 'g1');
            s.linkSocket('theirs', 'g1');
            expect(s.unregister('mine')).toEqual({ userId: 'u1', orphanedGames: ['g1'] });
        });

        test('one socket in two games orphans both', () => {
            const s = createSessionRegistry();
            s.register('u1', 's1');
            s.linkSocket('s1', 'g1');
            s.linkSocket('s1', 'g2');
            expect(s.unregister('s1').orphanedGames.sort()).toEqual(['g1', 'g2']);
        });

        test('linking an unknown socket is ignored', () => {
            const s = createSessionRegistry();
            s.linkSocket('ghost', 'g1');
            expect(s.stats()).toEqual({ sockets: 0, users: 0, gameLinks: 0, activeGames: 0 });
        });
    });
});
