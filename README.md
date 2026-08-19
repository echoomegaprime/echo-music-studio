# Echo Suno Studio

Compose with **Grok, GPT, Claude, or Qwen**. Render through your Suno account. Clone a voice with ElevenLabs and inject it into a Suno vocal stem.

Repo: [echoomegaprime/echo-music-studio](https://github.com/echoomegaprime/echo-music-studio)

Credentials stay server-side. No scrape. No pooled Suno key.

## Architects

Pick a writer in the control-room chat. The first live key wins if your pick is offline.

| Model | Env |
| --- | --- |
| Grok | `XAI_API_KEY` (optional `XAI_MODEL`, default `grok-4.5`) |
| GPT | `OPENAI_API_KEY` (optional `OPENAI_MODEL`, default `gpt-4.1`) |
| Claude | `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`) |
| Qwen | `QWEN_API_KEY` or `DASHSCOPE_API_KEY` (optional `QWEN_BASE_URL`, `QWEN_MODEL`) |

Suno Platform key and ElevenLabs key go in **Vault** after sign-in. They never return to the browser.

## Connector (Grok / GPT / Claude / Qwen)

See [CONNECTOR.md](./CONNECTOR.md).

## Run

```bash
npm install
npm run dev
```

Preview binds `0.0.0.0:8080`.
