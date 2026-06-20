---
name: api-server has no auth or rate limiting
description: All api-server routes are public; OpenAI-spending endpoints need self-throttling
---
The Express `artifacts/api-server` has NO authentication and NO rate-limiting middleware on any route. Routes like `/analyze/mpesa` and `/chat` directly spend server-side OpenAI credits while being publicly reachable.

**Why:** A code review flagged the AI `/chat` endpoint as a cost-abuse risk, but the whole API already follows the unauthenticated pattern — adding Firebase auth to a single route would be inconsistent and a large change.

**How to apply:** When adding any new endpoint that spends money (LLM calls, paid APIs), add a lightweight in-memory per-IP rate limiter + strict input caps directly in the route (no external dep needed). Do not assume an auth layer exists. If real auth is ever required, it must be applied app-wide, not per-route.
