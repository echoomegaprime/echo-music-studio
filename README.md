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
