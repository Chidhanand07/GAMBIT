# Frontend characterization tests

These tests pin what the big client pages do **today** so the PR 03+ refactor
(splitting the pages into hooks, components and a reducer) can show that
behaviour did not change. The legacy page is the source of truth: if it does
something odd, the test asserts the odd behaviour and marks it with a
`LEGACY:` comment. Do not "fix" those assertions in a refactor PR.

| File | Page under test |
| --- | --- |
| `GamePage.test.tsx` | `app/game/[id]/page.tsx` |
| `LobbyPage.characterization.test.tsx` | `app/lobby/page.tsx` (adds to `__tests__/components/LobbyPage.test.tsx`) |
| `ProfilePage.test.tsx` | `app/profile/[username]/page.tsx` |
| `AuthPages.test.tsx` | `app/auth/exchange`, `app/login`, `app/signup` pages |
| `SocialPages.test.tsx` | `app/challenge/[username]`, `app/join/[token]`, `app/leaderboard` pages |
| `HomeSettingsPages.test.tsx` | `app/page.tsx` (landing) and `app/settings/page.tsx` |
| `ProfileProvider.test.tsx` / `PresenceProvider.test.tsx` | the two context providers |
| `sounds.test.ts` | `lib/sounds.ts` |
| `KnightCanvas.test.tsx` | `components/ui/KnightBackground.tsx`, `components/ui/KnightIntro.tsx` (recorded canvas calls, digest snapshots) |
| `fakeSocket.ts` | shared fake socket and `jsonResponse` helper |

## Running

```bash
cd frontend
npx jest __tests__/characterization          # just these
npx jest                                     # whole frontend suite
```

## Rules

- Black-box only: render the page's default export and interact with it through
  roles and text. Mock **only** the stable seams: `@/components/SocketProvider`,
  `@/components/ProfileProvider`, `@/components/PresenceProvider`,
  `@/lib/supabase/client`, `@/lib/sounds`, `next/navigation`, `next/link`,
  `next/dynamic`, `qrcode.react` and `global.fetch`. Never mock a page's
  internal modules; they are about to move.
- Pin socket payloads and fetch calls exactly (`toEqual`), including field
  names and request options.
- Use fake timers only in tests that need them (clocks, the 400 ms game-over
  delay, the 30 s rematch timeout, the 2 s "Copied" label).
- Use made-up values for tokens and ids (for example `tok_FAKE_0001`), never
  real ones.

## Adding a case

1. Pick the file for the page and the `describe` block for the feature.
2. Set up the inputs: `profile`, the fetch fixtures (`gameRow`, `routes`,
   `activeGame`), and any server events via `socket.serverSends(event, payload)`.
3. Act like a user: `fireEvent.click`/`change`/`keyDown` on elements found by
   role or text. On the game board, `square('e2')` finds a square
   (pass `flipped = true` when you play black).
4. Assert what the page shows and what it sent: `socket.emitted('make_move')`
   or `fetchMock.mock.calls`.
5. Run the suite three times to make sure the test is not flaky.
