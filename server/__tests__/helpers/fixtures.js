const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** A Redis game-state object as written by matchmaking / joinPrivateGame. */
function makeGame(overrides = {}) {
    return {
        id: 'game-1',
        fen: START_FEN,
        startFen: START_FEN,
        whiteId: 'white-user',
        blackId: 'black-user',
        whiteClockMs: 600000,
        blackClockMs: 600000,
        activeSide: 'w',
        status: 'active',
        result: null,
        reason: null,
        moveLog: [],
        timeControl: '10',
        incrementMs: 0,
        isRated: true,
        lastMoveAt: null,
        disconnectInfo: null,
        ...overrides,
    };
}

/** A fake socket.io server: records every `io.to(room).emit(event, payload)`. */
function makeIo() {
    const emitted = [];
    const io = {
        emitted,
        to: jest.fn((room) => ({
            emit: (event, payload) => emitted.push({ room, event, payload }),
        })),
        emit: jest.fn((event, payload) => emitted.push({ room: '*', event, payload })),
        eventsNamed(name) { return emitted.filter(e => e.event === name); },
    };
    return io;
}

module.exports = { START_FEN, makeGame, makeIo };
