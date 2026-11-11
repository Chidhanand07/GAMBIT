# ADR 0230 — Delete the unreachable "Public Profile" edit modal from the profile page

- **Status:** accepted (PR 15, profile page split)

## Context

`app/profile/[username]/page.tsx` contained an edit-profile modal (display
name / bio / country form, `PATCH /api/profile/me`) gated by
`isEditModalOpen`. The task asked to keep it rendered under the same
conditions, or delete it if it is provably dead.

Proof that it can never render (grep over `frontend/app`, `frontend/components`,
`frontend/lib` before the change):

- `isEditModalOpen` is initialised with `useState(false)`.
- `setIsEditModalOpen` has four call sites, all inside the modal itself or its
  save handler, and every one passes `false`
  (`page.tsx:263, 807, 816, 879` at commit e93015f). Nothing passes `true`.
- The state is local to the page component; it is not exported, put in
  context, or reachable from the URL. The header's "Edit Profile" control is a
  `<Link href="/settings">`, not a modal opener.
- The PR-02 characterization test pins this:
  `"LEGACY: the edit-profile modal (PATCH /api/profile/me) has no opener; it never renders"`.

Removing it also removes state that only fed the modal (`bio`, `displayName`,
`country`, `saveLoading`, `saveSuccess`, `handleSaveProfile`) and the
`setBio/setDisplayName/setCountry` calls in the profile loader. Those setters
only updated state that nothing rendered, so nothing visible changes.

## Options

1. Move the modal into `features/profile/components/EditProfileModal.tsx` and
   keep rendering it behind an always-false flag.
2. Delete it as dead code (PLAYBOOK exception: deleting code proven dead).

## Decision

Option 2. The `PATCH /api/profile/me` route handler is not touched. The
settings page still uses it.

## Why

Option 1 would keep about 90 lines of JSX and 6 state variables that cannot
run, plus a component and a hook to maintain and lint, only to render `null`.
No request, DOM node or timer goes away, because the modal never mounted.
If the product wants in-place editing back, the deleted code is in git history
(commit e93015f, lines 804–896).
