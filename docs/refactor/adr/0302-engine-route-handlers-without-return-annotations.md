# ADR 0302 — Engine route handlers carry no return annotation

- **Status:** accepted (PR 17)

## Context

The PR 17 brief asks for type hints on all public functions. FastAPI 0.104
treats a route handler's return annotation as its `response_model`: adding
`-> dict` would add a response schema to `/openapi.json` and route every
response through response validation/serialisation.

## Options

1. Annotate handlers with `-> dict` (OpenAPI and serialisation change).
2. Annotate and pass `response_model=None` on every decorator (noise).
3. Leave handler return types unannotated; annotate their parameters
   (pydantic request models) and every other public function.

## Decision

Option 3, documented in `routers/__init__.py`.

## Why

Behaviour preservation outranks the SHOULD-level typing rule. Verified by
diffing `app.openapi()` and the route table before and after PR 17
(identical). Response models can be introduced deliberately later.
