# Connectors — Grok, GPT, Claude, Qwen

This repo is the shared source for Echo Suno Studio. Chat clients are interchangeable. Suno and ElevenLabs stay in the vault.

## GitHub apps (code)

| Model | Connector | Action |
| --- | --- | --- |
| Grok | [Grok (by xAI)](https://github.com/apps/grok-by-xai) | Already on `echoomegaprime` |
| ChatGPT / Codex | [ChatGPT Codex Connector](https://github.com/apps/chatgpt-codex-connector) | [Install](https://github.com/apps/chatgpt-codex-connector/installations/new) on `echo-music-studio` |
| Claude | Claude GitHub / Cowork connector | Grant this private repo |
| Qwen | Qwen / Qoder GitHub connector | Grant this private repo |

Private repo: collaborators and GitHub Apps must be invited. Public would let anyone clone; keep private until you want that.

## In-app architects (compose)

The control-room chat can write with any live key:

| Chip | Env |
| --- | --- |
| Grok | `XAI_API_KEY` |
| GPT | `OPENAI_API_KEY` |
| Claude | `ANTHROPIC_API_KEY` |
| Qwen | `QWEN_API_KEY` or `DASHSCOPE_API_KEY` |

If a chip is dim, that key is missing. The studio still sketches locally.

## Runtime MCP (ChatGPT Apps / Claude / Grok tools)

Resource: `/oauth-mcp-suno-v1`

```
You → Grok / GPT / Claude / Qwen
        → Echo OAuth
        → Vault (your Suno key, your ElevenLabs key)
        → Suno Platform / ElevenLabs
```

Paid actions require confirmation token `EXECUTE`. The Suno password is never in chat.
