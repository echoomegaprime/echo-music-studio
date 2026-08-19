# Connectors — Grok and GPT on this repo

**Question:** *what is the connector so Grok and GPT can both use this repo?*

**Answer:** two different GitHub Apps, one per host. The repo is the shared source of truth. Each model attaches via its own GitHub App.

| Host | Connector (the GitHub App) | Install URL | What it does |
| --- | --- | --- | --- |
| **Grok** | [Grok (by xAI)](https://github.com/apps/grok-by-xai) (`grok-by-xai`) | [Install](https://github.com/apps/grok-by-xai/installations/new) | MCP tools in Grok (`github___search_repositories`, `github___push_files`, PRs, …). Already installed on `echoomegaprime`. |
| **ChatGPT / Codex** | [ChatGPT Codex Connector](https://github.com/apps/chatgpt-codex-connector) (`chatgpt-codex-connector`) | [Install](https://github.com/apps/chatgpt-codex-connector/installations/new) | Lets ChatGPT read the repo in chat and lets Codex write / review. **Must be installed on this repo (or All repos) for GPT to see it.** |

There is no third “Echo connector” required for basic Grok + GPT access. Echo Nexus is the fleet OAuth MCP registry for suite tools — separate from GitHub source control.

---

## Grok (already on)

1. Grok Settings → Connectors → GitHub (authorize **Grok (by xAI)**).
2. Confirm the app is installed on `echoomegaprime` (it is).
3. In Grok, ask it to work on `echoomegaprime/echo-music-studio`.
4. Grok reads `AGENTS.md` in this repo plus the shared pack `echoomegaprime/echo-ai-skills`.

Repo install (if you ever re-scope it): [https://github.com/apps/grok-by-xai/installations/new](https://github.com/apps/grok-by-xai/installations/new)

---

## ChatGPT / Codex (install this)

GPT will **not** see a private repo until the Codex GitHub App is installed on the owner account.

1. Stay signed into GitHub as **echoomegaprime**.
2. Open **[https://github.com/apps/chatgpt-codex-connector/installations/new](https://github.com/apps/chatgpt-codex-connector/installations/new)**.
3. Choose **Only select repositories** → `echo-music-studio` (or All repositories).
4. Click **Install & Authorize**.
5. In ChatGPT: **Settings → Connectors → GitHub** and confirm the same account is linked.
6. In **Codex** (ChatGPT desktop / chatgpt.com/codex), add project `echoomegaprime/echo-music-studio`.
7. Codex reads `AGENTS.md` and `.github/copilot-instructions.md`.

Until the import PR is merged, point Codex at branch `agent/import-echo-music-studio` (that is where the app lives). After merge, `main` is enough.

---

## Shared playbooks

Both models should load the same skill pack:

[https://github.com/echoomegaprime/echo-ai-skills](https://github.com/echoomegaprime/echo-ai-skills)

| Host | Adapter |
| --- | --- |
| Grok | `adapters/grok.md` |
| Codex / ChatGPT | `adapters/codex.md` |
| Claude | `adapters/claude.md` |

Do **not** copy skills into this app repo. Point at `echo-ai-skills` so the fleet stays one source of truth.

---

## Verify

After GPT’s app is installed:

```text
https://github.com/settings/installations
```

You should see **both**:

- Grok (by xAI)
- ChatGPT Codex Connector

each listing `echo-music-studio` (or All repositories).
