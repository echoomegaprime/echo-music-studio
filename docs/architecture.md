# Architecture

Echo Music Studio is a TanStack Start app: file routes under `src/routes/`, server functions under `src/lib/suno/api.ts`, Postgres-compatible SQL via `src/lib/db.ts`.

```text
Browser  →  Studio UI (compose / library / jobs / projects / settings)
                │
                ▼
         TanStack server functions  (authMiddleware)
                │
     ┌──────────┼──────────┐
     ▼          ▼          ▼
  Vault      Engine     Architect
 (encrypt)  (jobs +     (song spec)
             tracks)
     │          │
     ▼          ▼
  PGLite / Postgres     Provider
                        ├─ Suno Platform (when vault authenticates)
                        └─ local sketch (always available)
```

## Data

- `migrations/0001_auth.sql` — Better Auth tables
- `migrations/0002_suno.sql` — vault, drafts, projects, jobs, tracks, artifacts

`DATABASE_URL` empty → PGLite (WASM Postgres) so clone-and-run works. Set `DATABASE_URL` for Neon/Postgres.

## Auth

Better Auth email/password. `StudioGate` wraps authenticated routes. All Suno server functions take `authMiddleware` and pass `context.userId` into the engine. Isolation is row-level (`user_id` on every studio table).

## Generation

1. User writes a concept on `/`.
2. `sunoArchitect` turns it into a `SongSpec` (structure, vocal, production, lyrics).
3. `sunoGenerate` with `confirmation: "EXECUTE"` inserts a job.
4. If the vault authenticates, the provider adapter submits to Suno Platform; otherwise `renderLocalSketch` writes an artifact.
5. Jobs poll until terminal state. Tracks appear in library / now-playing.

Ceilings (per UTC day, per user): 8 Suno generates, 24 sketches. See `SUNO_GENERATE_CEILING` / `SKETCH_CEILING` in `src/lib/suno/types.ts`.

## Vault

`src/lib/suno/vault.server.ts` encrypts the provider API key with a server secret (`BETTER_AUTH_SECRET` or derived fallback). Status returns `hint` + `authenticated` only.

## Preview / PWA scaffolding

`scripts/grok-pwa-*` and `public/__grok/` exist so the app still boots in the original App Builder preview host. They are not product features. Do not surface them in the studio UI.
