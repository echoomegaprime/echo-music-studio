# GitHub Copilot / Codex instructions

This repository is **Echo Music Studio** under `echoomegaprime`.

Read `AGENTS.md` first. Then `docs/CONNECTORS.md` if you are wiring model access.

## Non-negotiables

- Do not add copyrighted lyrics or living-artist impersonation payloads.
- Do not fake Suno / provider API responses. Empty vault → local sketch engine.
- Never return raw vault credentials to the client, logs, or chat.
- Scope every data query to the authenticated user.
- Paid/external generations require `confirmation: "EXECUTE"`.
- Work on `agent/<short-description>` and open a draft PR. Do not push to `main`.

## Stack

TanStack Start, Vite 8, React 19, Tailwind v4, Better Auth, Kysely, PGLite (or `DATABASE_URL`). Dev: `npm run dev` on `0.0.0.0:8080`.

## Validation

`npm run typecheck` and `npm test` must pass on your commit.
