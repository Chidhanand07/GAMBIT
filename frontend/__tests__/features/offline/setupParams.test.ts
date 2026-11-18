import { computerSetupHref, parseComputerSetup } from '@/features/offline/setupParams'

const params = (q: string) => new URLSearchParams(q)

describe('parseComputerSetup', () => {
    test.each([
        ['difficulty=easy&side=w', { difficulty: 'easy', colorChoice: 'w' }],
        ['difficulty=hard&side=b', { difficulty: 'hard', colorChoice: 'b' }],
        ['difficulty=medium&side=random', { difficulty: 'medium', colorChoice: 'random' }],
    ])('%s', (q, expected) => expect(parseComputerSetup(params(q))).toEqual(expected))

    test.each(['', 'difficulty=easy', 'side=w', 'difficulty=insane&side=w', 'difficulty=easy&side=white'])(
        '"%s" is no preset (the setup screen shows)',
        (q) => expect(parseComputerSetup(params(q))).toBeNull(),
    )

    test('no search params at all', () => expect(parseComputerSetup(null)).toBeNull())
})

test('computerSetupHref round-trips', () => {
    const href = computerSetupHref({ difficulty: 'hard', colorChoice: 'random' })
    expect(href).toBe('/offline?difficulty=hard&side=random')
    expect(parseComputerSetup(new URL(href, 'http://x').searchParams)).toEqual({ difficulty: 'hard', colorChoice: 'random' })
})
