# Security Policy

## Supported versions

Security fixes are applied to the current `main` branch and the latest `1.x`
release. Older snapshots of this training application are not maintained.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| Latest `1.x` | Yes |
| Older releases | No |

## Reporting a vulnerability

Please report vulnerabilities privately through the repository's **Security →
Advisories → Report a vulnerability** flow. If private reporting is not
available, contact a repository maintainer privately before opening a public
issue. Do not include credentials, tokens, personal data, or a working exploit
in a public ticket.

Include the affected route or component, reproduction steps, impact, tested
version or commit, and any suggested mitigation. You should receive an
acknowledgement within three business days and a status update within seven
business days. We will coordinate a fix and disclosure date for confirmed
issues and credit reporters who want to be named.

## Security boundaries

This repository is an intentionally vulnerable-looking automation lab, but its
authentication and test-control boundaries are expected to remain secure.
`TEST_MODE` and `TEST_CONTROL_KEY` are for isolated local or CI environments
only. Never expose test controls, seeded credentials, development JWT secrets,
or the application database to an untrusted network.

Please report bypasses involving authentication, authorization, origin checks,
test controls, file handling, secrets, dependency integrity, or container
isolation. Benign deterministic error simulations that are explicitly labeled
as labs are not vulnerabilities unless they escape their documented boundary.
