# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities **privately** — do not open a public issue.

Use GitHub's private vulnerability reporting: go to the **Security** tab of this repository and click
**Report a vulnerability**. This opens a private advisory visible only to the maintainers.

Please include:

- a description of the vulnerability and its impact,
- steps to reproduce (a minimal proof of concept if possible),
- affected package(s) and version/commit.

You can expect an initial acknowledgement, and we'll work with you on a fix and coordinated disclosure.

## Scope — what Forge takes seriously

- **Cross-tenant isolation.** Any way to read or write another organization's data — relational or vector, via
  the app layer, RLS, the job path, the super-admin path, caching, or logs — is a critical-class bug.
- **Billing integrity.** Any way to grant an entitlement without a corresponding event, or to double-grant on a
  replayed webhook.
- **Secret exposure.** Any path that leaks a secret into logs, error output, or a client bundle.

## Handling secrets

Secrets are provided via validated environment variables only, server-side only. Never commit secrets; the
`.gitignore` excludes `.env` and key files, and CI runs a secret scan.
