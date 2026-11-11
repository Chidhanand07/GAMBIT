# High-risk fix phase — decision log

Decisions taken while fixing the HIGH-risk items from
[`docs/refactor/REPORT.md` §5](../refactor/REPORT.md) across three stacked PRs
(`fix/high-1-game-server-security`, `fix/high-2-web-engine-security`,
`fix/high-3-supabase-lockdown`). ADR style: context, options, decision, why.

Priority order used whenever two goals pulled apart: security correctness >
no regressions in existing user-facing features > rulebook MUST rules >
backwards-compatible rollout > simplicity.

The refactor's own log stays in [`docs/refactor/DECISIONS.md`](../refactor/DECISIONS.md).
This phase keeps its decisions in this one file (`F-0xx` ids), as the fix brief asked,
instead of one file per ADR under `docs/refactor/adr/`.

| ADR | Title | PR | Items |
|---|---|---|---|
| [F-001](#f-001) | Branch from `origin/main`, target `preprod` | 1 | — |
| [F-002](#f-002) | `GAMBIT_ENGINE_URL` is canonical; `ENGINE_URL` stays as a warned fallback | 1 | G5 |

---

## F-001

**Branch PR 1 from `origin/main`, target `preprod`.**

- **Context.** The brief says to branch from `origin/preprod` unless `origin/main` has
  commits `preprod` lacks. `origin/main` has one such commit: `416502a` (merge of PR #19,
  `preprod` → `main`). `git diff origin/preprod origin/main` is empty, so the trees are identical.
- **Options.** (a) branch from `origin/preprod`; (b) branch from `origin/main`.
- **Decision.** (b), as the brief prescribes for this case. PR 1 still targets `preprod`.
- **Why.** Following the stated rule keeps the branch a descendant of both. The PR diff is
  unaffected because the trees match; the PR's commit list shows the extra merge commit.

## F-002

**`GAMBIT_ENGINE_URL` is the canonical engine URL variable on the game server (G5).**

- **Context.** `server/src/config/env.js` read `ENGINE_URL`, while `server/.env.example`,
  `README.md`, `DEPLOY.md` and `setup.md` all document `GAMBIT_ENGINE_URL`. A deployment
  configured from the docs silently talked to `http://localhost:8001`.
- **Options.** (a) rename the docs to `ENGINE_URL`; (b) read only `GAMBIT_ENGINE_URL`;
  (c) read `GAMBIT_ENGINE_URL`, fall back to `ENGINE_URL` with a warning.
- **Decision.** (c). A warning is also logged when neither is set and `NODE_ENV=production`.
  Each warning is logged once per process, because the accessor runs on every engine call (ADR 0101).
- **Why.** Docs were already consistent, so the code moves to them. The fallback means a
  deployment that set `ENGINE_URL` by reading the code keeps working (backwards-compatible rollout).
  The server no longer needs the engine for move legality (F-006), so a missing URL degrades
  analysis and game review only; that is why it warns rather than refusing to boot.
