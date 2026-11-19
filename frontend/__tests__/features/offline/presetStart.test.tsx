/** /offline?difficulty=&side= (the lobby's "Start game") starts the game without the setup screen. */
import { act, render, screen } from '@testing-library/react'

let query = ''
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(query) }))
jest.mock('@/lib/sounds', () => ({
    playMoveSound: jest.fn(),
    playCaptureSound: jest.fn(),
    playCheckSound: jest.fn(),
    playGameEndSound: jest.fn(),
    playGameStartSound: jest.fn(),
}))
import * as sounds from '@/lib/sounds'
import ComputerPage from '@/app/offline/page'

let fetchMock: jest.Mock
beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ uci: 'e2e4' }) }))
    ;(global as any).fetch = fetchMock
})
afterEach(() => jest.useRealTimers())

test('a valid preset starts once with that difficulty; as Black MAVERICK opens', async () => {
    query = 'difficulty=hard&side=b'
    render(<ComputerPage />)
    expect(screen.queryByRole('button', { name: 'Start Game' })).not.toBeInTheDocument()
    expect(screen.getByText('hard')).toBeInTheDocument()
    expect(sounds.playGameStartSound).toHaveBeenCalledTimes(1)
    await act(async () => { jest.advanceTimersByTime(1000) })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.difficulty).toBe('hard')
})

test('an invalid preset shows the setup screen', () => {
    query = 'difficulty=insane&side=b'
    render(<ComputerPage />)
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeInTheDocument()
    expect(sounds.playGameStartSound).not.toHaveBeenCalled()
})
