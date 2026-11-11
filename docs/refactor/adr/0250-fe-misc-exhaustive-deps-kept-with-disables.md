# ADR 0250 — fe-misc: effects whose dependency list is deliberately incomplete keep it, with a reasoned disable

- **Status:** accepted (fe-misc, PR 16 track)

## Context

`react-hooks/exhaustive-deps` is an error for non-baselined files. Four effects in the
fe-misc scope list fewer dependencies than they read, and that is what makes them work:

| Where | Deps | Reads | What "fixing" would do |
|---|---|---|---|
| `app/login/page.tsx` error-clear effect | `[email, password]` | `error` | adding `error` re-runs the effect right after an error is set and clears it immediately — the message would never show |
| `app/signup/page.tsx` error-clear effect | `[email, password, confirm, username]` | `error` | same |
| `features/settings/hooks/useProfileSettings.ts` prefill (was `app/settings/page.tsx`) | `[profile?.id]` | `profile` | re-prefills on every `refetch()` (new object, same id), wiping unsaved edits after an avatar upload |
| `components/PresenceProvider.tsx` presence channel | `[profile?.id]` | `profile.username` | re-subscribes (untrack, removeChannel, new channel, track) when only the username changes |

## Options

1. Add the missing dependencies (changes when the effects run — forbidden).
2. Rewrite with refs / functional updates (e.g. `setError(prev => prev ? null : prev)`) so the
   linter is satisfied. Possible for the error-clear effects, but it changes the update path
   (an updater runs during render instead of a closure read) for no user-visible gain and is
   harder to review as "no behaviour change".
3. Keep the dependency lists and add `eslint-disable-next-line react-hooks/exhaustive-deps --
   behaviour preserved: <reason>` on the dependency line.

## Decision

Option 3, for exactly the four effects above. The characterization tests
(`__tests__/characterization/AuthPages.test.tsx`, `HomeSettingsPages.test.tsx`,
`PresenceProvider.test.tsx`) pin each behaviour: the error clears on the next keystroke, the
settings form is not reset when only the profile object changes, and the presence channel is
re-created only for a new user id.

## Why

Behaviour preservation outranks rulebook SHOULD rules. The disables are line-scoped, carry the
reason, and are listed in the PR body so a later behaviour-changing PR can revisit them.
