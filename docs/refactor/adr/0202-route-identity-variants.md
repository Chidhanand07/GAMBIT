# ADR 0202 — Route-handler identity: two cookie variants kept, one shared decoder

- **Status:** accepted (PR 11)

## Context

Ten route files identified the caller from the `sb-<ref>-auth-token`
cookie (chunked `.0`–`.9`) by base64-decoding the access-token JWT **without
verifying its signature**, then used the service-role client (known bug,
preserved). Nine carried an identical inline `getUserId`;
`/api/profile/me` had its own `getRawAuthCookie` + `decodeJwtPayload` +
`getUserId`. `/api/games/[id]` uses an anon `@supabase/ssr` client and
`auth.getSession()`; `/api/debug/session` uses `auth.getUser()`.

Diffing the two cookie variants line by line: same cookie name derivation,
same chunk bound (10, stop at first gap), same `JSON.parse` →
`JSON.parse(decodeURIComponent())` fallback, same "3 parts" check, same
base64url decoding and padding, same 60 s expiry leeway, same `sub ?? null`.
Payload edge cases (JSON `null`, falsy primitives, empty middle part) all end
in `null` in both. **One difference:** the inline copy uses
`cookieStore.get(base)?.value ?? <chunks>`, so a present-but-*empty* base
cookie yields `null`; the profile/me copy uses `if (single?.value)`, so an
empty base cookie falls through to the chunk cookies.

## Options

1. Unify on one variant (changes behaviour for the empty-base-cookie case on
   either nine route files or one).
2. Keep two public functions that differ only in how the raw cookie is
   assembled, sharing the session/JWT decoding that is identical.
3. Keep two full copies.

## Decision

Option 2. `lib/server/identity.ts` exports `getUserId` (the inline variant,
used by 9 route files / 10 handlers) and `getUserIdSkippingEmptyCookie` (`/api/profile/me`),
both delegating to a private `userIdFromSessionCookie(raw)`. `getSessionUser`
wraps the `/api/games/[id]` `getSession()` path (used by its GET and PATCH).
`/api/debug/session` keeps calling `auth.getUser()` inline (single use).
`__tests__/lib/server/identity.test.ts` pins the agreement on all normal
inputs and the one divergence. `middleware.ts` has a third, boolean variant
(`isValidSession`, which *requires* a numeric `exp`); it is not a route
handler and is left untouched.

## Why

Behaviour preservation outranks deduplication. Sharing the decoder removes
the nine copies (SOLID-01/DRY) while the separate cookie readers keep each
route's exact semantics; the test makes the divergence visible so a later,
deliberate behaviour-change PR (verify the JWT, then unify) has a clear target.
