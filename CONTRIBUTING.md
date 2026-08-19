# Contributing

Agents and humans: follow [AGENTS.md](AGENTS.md) and the [echo-github](https://github.com/echoomegaprime/echo-ai-skills/blob/main/skills/echo-github/SKILL.md) skill.

## Workflow

1. Branch from `main`: `agent/<short-description>`.
2. Keep one concern per PR.
3. Open a **draft** PR against `main`.
4. `npm run typecheck` and `npm test` must pass.
5. Add a CHANGELOG line under `## [Unreleased]` for user-visible changes.
6. Commit as `ECHO OMEGA PRIME <bobbymcwilliams@echo-op.com>`.

## Code style

Honor `.editorconfig` and `.prettierrc`. No drive-by reformatting in feature PRs.

## Security

Disclosures go through [SECURITY.md](SECURITY.md), not GitHub issues. Never commit secrets.
