# Security Policy

## Supported Versions

Security fixes are provided for the latest release tagged on GitHub. Older tags are not actively supported unless noted in a release announcement.

## Reporting a Vulnerability

Please report security issues **privately** — do not open a public issue with exploit details.

**Preferred:** [GitHub Security Advisories](https://github.com/Zac134/NotionToRoblox/security/advisories/new) (Private vulnerability report)

**Alternative:** Open a GitHub Issue with a high-level description only (no proof-of-concept payloads, no credentials).

## What to Include

- A clear description of the issue and potential impact
- Steps to reproduce (if applicable)
- Affected version or commit

## What Not to Include

- **Do not paste secrets** in issues or advisories: `NOTION_TOKEN`, `ROBLOX_API_KEY`, `.env` contents, or full API responses containing credentials.
- Do not attach production configuration files that may contain real IDs tied to live assets unless redacted.

## Response Timeline

| Stage | Target |
| --- | --- |
| Initial acknowledgment | Within 7 days |
| Triage and severity assessment | Within 14 days |
| Fix or mitigation plan | Depends on severity; critical issues prioritized |

We will coordinate disclosure timing with reporters when possible.

## Scope

This policy covers the NotionToRoblox CLI source code and its documented configuration flow. It does not cover third-party services (Notion, Roblox, GitHub) or user-managed secrets stored in local `.env` files.
