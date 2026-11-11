# Refactor decision log

Architecture decisions taken during the 2026 behaviour-preserving refactor.
Each decision is one file in `docs/refactor/adr/` (context, options, decision,
why). One file per ADR keeps parallel branches from conflicting on this log.

Numbering: `0001–0099` cross-cutting, `0100–0199` server, `0200–0299`
frontend, `0300–0399` chess-engine.

| ADR | Title | PR |
|---|---|---|
| [0001](adr/0001-adr-files-and-rulebook-source.md) | One file per ADR; rulebook source | 00 |
| [0002](adr/0002-lint-ratchet-and-formatting-scope.md) | Lint ratchet, formatting scope and logging rule | 01 |
| [0003](adr/0003-consolidate-stack-to-13-prs.md) | Consolidate the stack from 19 to 13 PRs | 12 |
| [0100](adr/0100-server-domain-layer.md) | Server domain layer: shape and exact-parity choices | 03 |
| [0101](adr/0101-server-config-call-time-accessors.md) | Server config: call-time accessors, dotenv stays put, raw engine responses | 04 |
| [0102](adr/0102-server-repositories-return-raw-queries.md) | Server repositories return the raw Supabase query; legacy modules build their own instances | 04 |
| [0103](adr/0103-server-services-ports-and-facades.md) | Server services: emitter and client ports, deps-context functions, legacy facades | 05 |
| [0104](adr/0104-server-delete-dead-express-endpoints.md) | Delete the 13 Express endpoints that have no callers | 06 |
| [0105](adr/0105-server-entry-adapters-and-composition-root.md) | Server entry adapters, composition root and the server.js shim | 06 |
| [0200](adr/0200-time-control-buckets-not-unified.md) | Divergent time-control → speed-bucket mappings are not unified | 07 |
| [0201](adr/0201-shared-types-describe-current-wire-format.md) | `frontend/types/` describes the current wire format, quirks included | 07 |
| [0202](adr/0202-route-identity-variants.md) | Route-handler identity: two cookie variants kept, one shared decoder | 08 |
| [0203](adr/0203-lib-server-data-access-shape.md) | Shape of `frontend/lib/server` (clients, data functions) | 08 |
| [0210](adr/0210-game-page-feature-split.md) | Game page split into `features/game` (reducer, hooks, components) | 09 |
| [0211](adr/0211-disconnect-countdown-keeps-usestate.md) | Opponent-disconnect countdown stays in `useState`, outside the reducer | 09 |
| [0212](adr/0212-game-effects-keep-legacy-deps.md) | Game hooks keep the legacy effect dependencies (documented eslint-disables) | 09 |
| [0213](adr/0213-game-board-uses-shared-piece.md) | The game board uses the shared `components/ui/Piece.tsx` | 09 |
| [0220](adr/0220-lobby-private-game-state-lives-in-page-hook.md) | Lobby private-game state lives in a page-level hook, not in the modal | 10 |
| [0221](adr/0221-lobby-join-queue-payload-shapes-kept-separate.md) | The two lobby `join_queue` payload shapes are kept separate | 10 |
| [0222](adr/0222-lobby-component-boundaries-and-reconciliation.md) | Lobby component boundaries: accepted React reconciliation differences | 10 |
| [0230](adr/0230-delete-unreachable-profile-edit-modal.md) | Delete the unreachable "Public Profile" edit modal from the profile page | 10 |
| [0231](adr/0231-profile-hooks-keep-legacy-effect-deps.md) | Profile hooks keep the legacy effect dependency lists and call order | 10 |
| [0232](adr/0232-profile-fetch-helpers-return-response.md) | Profile fetch helpers return the raw (typed) Response | 10 |
| [0240](adr/0240-fe-shell-feature-folders-and-api-helpers.md) | fe-shell pages split into feature folders, characterization tests first | 10 |
| [0241](adr/0241-navbar-entry-point-and-challenge-router-ref.md) | Navbar keeps its entry path; the challenge hook reads the router through a ref | 10 |
| [0242](adr/0242-analysis-effect-keys-and-lifted-import-state.md) | Analysis hooks: engine effect keyed on the FEN string; import inputs stay at page level | 10 |
| [0243](adr/0243-dom-normalisations-allowed-in-fe-shell.md) | Markup differences accepted in the fe-shell split (none user-visible) | 10 |
| [0250](adr/0250-fe-misc-exhaustive-deps-kept-with-disables.md) | fe-misc: effects whose dependency list is deliberately incomplete keep it, with a reasoned disable | 10 |
| [0251](adr/0251-shared-google-button-passes-svg-props.md) | Login and signup share one Google button that passes svg props through | 10 |
| [0252](adr/0252-canvas-characterization-by-recorded-call-digest.md) | Canvas animations are characterized by a digest of recorded 2D-context calls | 10 |
| [0260](adr/0260-delete-unused-lib-supabase-server.md) | Delete unused `lib/supabase/server.ts` | 10 |
| [0301](adr/0301-engine-late-bound-seams-through-main.md) | Engine routers/services resolve dependencies through `main` at call time | 11 |
| [0302](adr/0302-engine-route-handlers-without-return-annotations.md) | Engine route handlers carry no return annotation | 11 |
| [0303](adr/0303-engine-exception-chaining-b904.md) | Apply `raise ... from e` (Ruff B904) in the engine | 11 |
| [0304](adr/0304-engine-config-read-timing.md) | Engine env vars read once in config.py at import time | 11 |
