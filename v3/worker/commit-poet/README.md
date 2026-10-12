# commit-poet (optional)

A tiny Cloudflare Worker that writes the postcard's "commit message" with OpenAI
(`gpt-5-mini`, Responses API, ≤60 output tokens). The game never needs it: the
offline poet in `src/commit-poet.js` is the default and the fallback.

## Deploy (needs the owner's OpenAI key; not deployed by the build)

```sh
cd worker/commit-poet
npx wrangler login
npx wrangler secret put OPENAI_API_KEY      # paste the key; it stays in Cloudflare
npx wrangler deploy                          # prints https://forkwood-commit-poet.<you>.workers.dev
```

Then point the game at it (any one of):

- add `<meta name="forkwood-poet" content="https://forkwood-commit-poet.<you>.workers.dev">` to `index.html`, or
- set `window.FORKWOOD_POET_URL = '…'` before `src/main.js` loads, or
- (testing) `localStorage.setItem('forkwood.poet', 'https://…')` in the console.

With no endpoint the client never calls the network.

## Behaviour

- CORS: only `ALLOW_ORIGIN` (`https://ducvuathuduc.github.io`); other origins get 403.
  For local testing, `npx wrangler dev --var ALLOW_ORIGIN:http://localhost:8080`.
- Rate limit: 6 requests / minute / IP through the `POET_LIMIT` Workers Rate Limiting
  binding (falls back to a per-isolate in-memory counter if the binding is missing).
- Input: numbers and enums only (world id, height, stage, counts, cause id); clamped
  and validated server-side, so players cannot inject prompt text.
- Output: `{ "type": "feat", "line": "climbed 412 m through the starry storm" }`, validated
  (known type, 4–72 chars) on both the worker and the client. Anything else → offline line.
- Client: waits at most 2 s, then keeps the offline line (`aiPoem` in `src/commit-poet.js`).
- Cost: one call per finished run that reaches the results screen; ≈60 output tokens.
