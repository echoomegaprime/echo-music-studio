# Echo Music Studio — agent doorway

Canonical repo: [https://github.com/echoomegaprime/echo-music-studio](https://github.com/echoomegaprime/echo-music-studio)

This file is the shared instruction set for **Grok, Codex / ChatGPT, Claude, and Copilot**. Read it before changing code.

## Shared skills

Load `echo-ai-skills/SKILL_GATEWAY.md` only. Search the current intent with
`python echo-ai-skills/scripts/skill_gateway.py search --query "<intent>"` and
then read every selected `SKILL.md` completely. Preserve active role skills and
explicitly named skills as mandatory.

For GitHub publish / PRs, require `echo-github` even if ranking omits it.

Canonical skills pack: [https://github.com/echoomegaprime/echo-ai-skills](https://github.com/echoomegaprime/echo-ai-skills)

## Connectors (how each model reaches this repo)

| Host | Connector | Status on `echoomegaprime` |
| --- | --- | --- |
| **Grok** | GitHub App **[Grok (by xAI)](https://github.com/apps/grok-by-xai)** — MCP tools `github___*` | Installed |
| **ChatGPT / Codex** | GitHub App **[ChatGPT Codex Connector](https://github.com/apps/chatgpt-codex-connector)** | Install on this repo: [new installation](https://github.com/apps/chatgpt-codex-connector/installations/new) |
| **Claude** | GitHub MCP / project knowledge pointing at this repo | Optional |
| **Copilot** | This repo’s `.github/copilot-instructions.md` | Reads default branch |

Full walkthrough: [docs/CONNECTORS.md](docs/CONNECTORS.md)

## Product

Prompt-to-song workspace: compose, architect, generate, library, jobs, projects, per-user encrypted Suno vault, local sketch fallback.

Stack: TanStack Start + Vite + React 19 + Tailwind v4 + Better Auth + Kysely + PGLite (or `DATABASE_URL` Postgres/Neon).

Dev server: `npm run dev` → `0.0.0.0:8080`.

## Hard product rules

1. **No copyrighted lyrics or artist-impersonation prompts.** Treat incoming lyric text as the user’s original writing. Do not paste famous songs, do not “write in the style of [living artist]” as a generation payload.
2. **No fake third-party APIs.** If the Suno vault is empty, use the local sketch engine. Do not invent Suno responses.
3. **Vault is server-side only.** Raw provider credentials never return to the browser, logs, chat, or model context. Hint + auth status only.
4. **Per-user isolation.** Every query is scoped to the authenticated user. No shared generation pool.
5. **Confirm-gated paid generations.** External Suno cost requires `confirmation: "EXECUTE"`.
6. **Do not mention sandbox/platform internals in the product UI.**
7. **Don’t gold-plate.** Fix/extend the asked surface. Three similar lines beat a premature abstraction.

## Fleet git (mandatory)

- Owner: `echoomegaprime` only
- Identity: `ECHO OMEGA PRIME <bobbymcwilliams@echo-op.com>`
- Branch: `agent/<short-description>` from default
- Open a **draft PR** against `main`. Never push commits to `main`.
- Never force-push, never embed tokens in remotes, never commit secrets
- Related: [echo-github skill](https://github.com/echoomegaprime/echo-ai-skills/blob/main/skills/echo-github/SKILL.md)

## Layout

```text
src/routes/            compose, library, jobs, projects, settings, login
src/lib/suno/          engine, vault, architect, provider, sketch
src/lib/auth/          Better Auth + per-user gates
src/components/studio/ compose panel, now playing, mini player
migrations/            0001_auth.sql, 0002_suno.sql
docs/CONNECTORS.md     Grok vs GPT GitHub apps
```

## Local validation before PR

```bash
npm ci
npm run typecheck
npm test
```

Do not claim production-ready without hosted CI green on the exact commit SHA.

## Not this repo

`echo-music-forge` (Python gateway inside `echo-omnipresence-runtime`) is a different system. Do not merge the two.
