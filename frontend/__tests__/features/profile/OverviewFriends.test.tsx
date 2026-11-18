/** [F-104] The Overview's Friends card shows Online / Away / Offline with the mockup's dot colours. */
import { render, screen } from '@testing-library/react'
import { OverviewTab } from '@/features/profile/components/OverviewTab'

jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href, className }: any) => <a href={href} className={className}>{children}</a> }))

const friend = (id: string, username: string) => ({ id, username, display_name: null, friendship_id: `f-${id}` }) as never

// Stacking (was: `onlineIds` + optional `awayIds` props): the card takes the presence sets of
// PresenceProvider, where away users are also present (F-131).
test('status text and dot per friend; Away from the away set', () => {
    render(
        <OverviewTab
            profileId="me"
            facts={[]}
            badges={[]}
            friends={[friend('a', 'ann'), friend('b', 'ben'), friend('c', 'cid')]}
            presence={{ present: new Set(['a', 'b']), away: new Set(['b']) }}
            recentGames={[]}
            recentLoading={false}
            onSeeFriends={jest.fn()}
            onViewAllGames={jest.fn()}
        />,
    )
    const line = (name: string) => screen.getByRole('link', { name }).parentElement!
    expect(line('ann')).toHaveTextContent('Online')
    expect(line('ben')).toHaveTextContent('Away')
    expect(line('cid')).toHaveTextContent('Offline')
    const dot = (name: string) => line(name).querySelector('span > span')!
    expect(dot('ann')).toHaveClass('bg-success')
    expect(dot('ben')).toHaveClass('bg-accent')
    expect(dot('cid')).toHaveClass('bg-ink-disabled')
})
