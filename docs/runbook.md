# Runbook

## Dev

```bash
npm ci
npm run dev    # 0.0.0.0:8080
```

Health: open `/` → login → compose. Without a vault key, Create still produces a local sketch.

## Vault outage / provider 4xx

1. Settings → Vault shows last error + hint.
2. Clear vault if the key was rotated.
3. Generations should fall back to sketch when unauthenticated. If they do not, that is a P0 in `src/lib/suno/engine.server.ts`.

## Database

- Preview / laptop: PGLite, data is process-local.
- Production: set `DATABASE_URL`. Run `npm run db:migrate`.

## Agent access broken

See [CONNECTORS.md](CONNECTORS.md). Grok uses `grok-by-xai`. GPT uses `chatgpt-codex-connector`. If GPT cannot see this private repo, the Codex GitHub App is not installed on `echoomegaprime`.
