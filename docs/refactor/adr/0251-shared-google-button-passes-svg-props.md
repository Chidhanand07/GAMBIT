# ADR 0251 — Login and signup share one Google button that passes svg props through

- **Status:** accepted (fe-misc, PR 16 track)

## Context

`app/login/page.tsx` and `app/signup/page.tsx` each inlined the same "Continue with Google"
button, the same 18×18 Google mark and the same "or" divider, plus an identical
`signInWithOAuth({ provider: 'google', options: { redirectTo: origin + '/auth/callback' } })`
handler. Both pages exceeded the 100-line function limit. The only markup difference is that the
login page's `<svg>` carries `xmlns="http://www.w3.org/2000/svg"` and the signup page's does not.

## Options

1. Keep two copies (no shared code; both pages stay over the limit or need other splits).
2. Share the component and drop/add `xmlns` on one page (markup change).
3. Share `GoogleSignInButton`, `OrDivider` and `startGoogleSignIn` in `features/auth`, with an
   `iconProps` prop spread onto the svg so login passes `{ xmlns }` and signup passes nothing.

## Decision

Option 3. Two real uses (SOLID-09). A temporary old-vs-new render comparison showed identical
`innerHTML` for both pages; the characterization tests pin the OAuth call and error text.

## Why

Removes ~40 duplicated lines from each page without changing a single rendered attribute.
