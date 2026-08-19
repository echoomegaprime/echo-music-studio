# Echo Suno Studio — connector

Grok, GPT, Claude, and Qwen all talk to the same studio. The chat client is interchangeable. Suno and ElevenLabs stay behind the vault.

## What this is

A governed music studio:

- Song architect (Grok / GPT / Claude / Qwen)
- Generate, cover, extend, mashup, stems, add vocals, WAV, video, persona, boost style
- Instant voice clone (ElevenLabs) injected into Suno vocal stems
- Per-user AES vault — the Suno credential never enters the model context

## ChatGPT (GPT)

Remote MCP + ChatGPT App UI.

- Resource: `/oauth-mcp-suno-v1`
- OAuth to Echo, not to Suno
- Tools: architect, generate, cover, extend, mashup, stems, inject_voice, jobs, library
- Confirmation token `EXECUTE` required for paid actions

Point ChatGPT custom GPT / Apps at the deployed MCP endpoint after OAuth.

## Grok

Same MCP pack. In Grok, add the remote connector to Echo Suno Studio. Grok can also run as the in-app architect when `XAI_API_KEY` is set.

## Claude

Use the same MCP server as a Claude custom connector / desktop MCP. Claude can also be the in-app architect when `ANTHROPIC_API_KEY` is set.

## Qwen

Same MCP. In-app architect when `QWEN_API_KEY` or `DASHSCOPE_API_KEY` is set.

## Auth path

```
You → Grok / GPT / Claude / Qwen
        → Echo OAuth
        → Vault (your Suno key, your ElevenLabs key)
        → Suno Platform / ElevenLabs
```

Never paste a Suno password into a chat.

Official Suno API access is requested at [platform.suno.com](https://platform.suno.com/) and [sunomusic.typeform.com/apiform](https://sunomusic.typeform.com/apiform).
