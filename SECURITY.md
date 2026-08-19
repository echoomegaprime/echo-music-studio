# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| `main` | yes |
| Latest tagged release | yes |
| Older releases | no |

## Reporting a vulnerability

**Do not file a public GitHub issue for security disclosures.**

Email **bobbymcwilliams@echo-op.com** with:

1. A description of the issue and the impact.
2. The exact steps to reproduce, including any payloads / inputs.
3. The commit SHA or release version where the issue was observed.
4. Your preferred contact handle for follow-up.

Acknowledgement: within 2 business days. A patch ETA follows the triage call.

## Studio-specific

- Provider API keys live only in the server-side vault. Never log, print, or return the raw key.
- Do not commit `.env`, PEMs, or customer audio.
- Confirm-gated generations (`EXECUTE`) are an abuse/cost control, not a substitute for auth.

## Disclosure timeline

- Day 0: Report received, ack sent.
- Day ≤ 7: Severity assessed, mitigation drafted.
- Day ≤ 30: Patch shipped on `main`; advisory drafted.
- Day ≤ 60: Public advisory + CVE (if applicable).
