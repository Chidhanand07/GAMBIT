# ADR 0231 — Profile hooks keep the legacy effect dependency lists and call order

- **Status:** accepted (PR 15, profile page split)

## Context

The profile page had seven effects in one component, four with incomplete
dependency lists:

| Effect | Legacy deps | Reads but omits |
| --- | --- | --- |
| friend status | `[profile?.id, meProfile?.id]` | `profile`, `meProfile`, `isOwnProfile`, `username` |
| games tab first page | `[activeTab, profile?.id]` | `games.length`, `profile`, `loadGames` |
| stats tab | `[activeTab, profile?.id]` | `statsData`, `profile`, `username` |
| friends tab | `[activeTab, profile?.id, isOwnProfile]` | `profile` |

The omissions are observable. For example, the games effect must not re-run when
`games` changes (otherwise an empty result would refetch on every render), and
the stats effect must not re-run after `statsData` is set. The characterization
tests pin "revisiting the tab does not refetch". Moving the effects into hooks
makes `react-hooks/exhaustive-deps` (an error in new files) flag all four.

## Options

1. Add the missing deps. This changes when the effects run.
2. Rewrite with refs/`useCallback` so the lint rule is satisfied while the
   effects keep running only on the same changes. Each effect would need refs
   for `games.length`, `statsData`, `profile` and `username`, mirrored on every
   render. That adds code and risk with no behavioural benefit.
3. Keep the exact legacy dependency arrays and add
   `// eslint-disable-next-line react-hooks/exhaustive-deps -- behaviour preservation: legacy deps [...]`
   on each (FRONTEND_TRACK allows this when refs cannot express it simply).

## Decision

Option 3 for the four effects above (in `useFriendStatus`, `useGameHistory`,
`useProfileStats`, `useFriends`). The page calls the hooks in the legacy
effect order (tab hash → profile load → friend status → games → stats →
friends → presence), so effects that fire in the same commit still fire in
that order. `RecentGamesList` stays a child component with its own effect, so
it still runs before the parent's effects.

## Why

Behaviour preservation ranks above lint-cleanliness. Each suppression is one
line, names the exact legacy dependency list, and is listed in the PR body.
An old-vs-new harness (rendering the pre-split page and the new page through
the same fetch/Supabase doubles in four scenarios) compared the `fetch` call
sequence and the `innerHTML` after every step. Both were identical. The 37
characterization tests pass unchanged.
