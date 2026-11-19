# Echo Suno Studio — API plugin

**Public API version.** Compose with **Grok, GPT, Claude, or Qwen**. Generate through the **Suno Platform API** (Bearer key in a server-side vault). Clone a voice with ElevenLabs and inject it into a Suno vocal stem.

Repo: [echoomegaprime/echo-music-studio](https://github.com/echoomegaprime/echo-music-studio)

This repo does **not** scrape suno.com and does **not** store consumer-site cookies. Each user pastes **their own** official (or documented REST) API credential. The key never enters the model context.

Personal operator (your Suno web account, session cookie) is a **separate private repo**: `echo-suno-operator`.

## Architects

| Model | Env |
| --- | --- |
| Grok | `XAI_API_KEY` |
| GPT | `OPENAI_API_KEY` |
| Claude | `ANTHROPIC_API_KEY` |
| Qwen | `QWEN_API_KEY` or `DASHSCOPE_API_KEY` |

Suno Platform key + ElevenLabs key → **Vault** after sign-in.

## Connector

See [CONNECTOR.md](./CONNECTOR.md) and [docs/CONNECTORS.md](./docs/CONNECTORS.md).

## Run

```bash
npm install
npm run dev   # 0.0.0.0:8080
```

## Read-only media preflight

Run `npm run media:preflight` in the operator environment. It reads its configured Suno Platform and ElevenLabs API keys and the selected `ECHO_NARRATION_VOICE_ID`. It checks the Studio Platform credit balance, ElevenLabs included character quota and visibility of the selected voice. The output contains status labels and numeric balances. Exit code 0 means all three reads succeeded with positive balances and the voice was listed. The result does not verify generation scope, a particular job's price, paid overage, or consumer suno.com session access. A custom Suno base URL reports `custom_provider_unverified`. Run `node --test scripts/media-preflight.test.mjs` for the offline fixtures.
