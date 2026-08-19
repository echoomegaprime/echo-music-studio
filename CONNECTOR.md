# Echo Suno Studio — API connector

Public plugin. Official Suno **Platform API** (or a documented REST provider). Grok, GPT, Claude, and Qwen are interchangeable clients.

Personal web-account operator (Clerk session cookie) lives in the **private** repo `echo-suno-operator`. Do not put cookies in this public repo.

## Path

```
You → Grok / GPT / Claude / Qwen
        → Echo OAuth
        → Vault (your Suno API key, your ElevenLabs key)
        → Suno Platform API
```

Resource: `/oauth-mcp-suno-v1`

Paid actions require `EXECUTE`. Never paste a Suno password into chat.

Official access: [platform.suno.com](https://platform.suno.com/) · [intake form](https://sunomusic.typeform.com/apiform)
