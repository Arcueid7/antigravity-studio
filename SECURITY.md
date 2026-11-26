# Security Policy

## Security Architecture & Boundaries

Antigravity Studio is designed as a **local-only desktop & browser workbench** running strictly on your own machine:

1. **Loopback-Only Binding**
   - `server.py` binds exclusively to `127.0.0.1` (default port `8765`). It is never intended to be exposed to LAN or public networks.
2. **DNS Rebinding & Cross-Origin Protection**
   - Every HTTP API request is validated by `backend/security.py` (`validate_local_request`):
     - Rejects non-loopback `Host` headers (blocks DNS rebinding attacks).
     - Rejects cross-origin `Origin` / `Referer` headers and `Sec-Fetch-Site: cross-site` requests (blocks browser CSRF from external tabs).
   - Responses include `X-Content-Type-Options: nosniff` and `Referrer-Policy: same-origin`.
3. **Filesystem & Path Traversal Guards**
   - Workspace file read/write/create/rename/delete APIs strictly enforce resolved-path containment inside the active workspace root.
   - Local folder browser create/rename/delete endpoints block drive roots, system directories (`Windows`, `Program Files`, `Users`, `/etc`, etc.), and symlink escapes.
   - Static file serving blocks `..` traversal and only serves inside `static/`.
4. **Local Credential Handling**
   - All runtime state (`data/settings.json`, conversations, uploads, checkpoints, WebView2 profile) lives under `data/`, which is gitignored and never transmitted to any third party by Antigravity Studio.
   - GitHub Personal Access Tokens / OAuth access tokens stored in `data/settings.json` are **redacted before returning settings over HTTP** (`github_token` is never echoed back to the frontend; only a boolean `github_token_set` is returned).
   - **GitHub OAuth Device Flow Client ID**: `backend/config.py` includes a public GitHub OAuth App Client ID (`DEFAULT_GITHUB_OAUTH_CLIENT_ID`) solely for zero-config RFC 8628 Device Flow authentication (Device Flow requires no Client Secret, and the OAuth token is exchanged directly between your local machine and `github.com`). You can override it with your own GitHub OAuth App Client ID or use a manual Personal Access Token at any time in **Settings → GitHub**.
5. **CLI Execution & Trust Model**
   - Antigravity Studio drives your locally installed `agy` CLI and local workspace PowerShell terminal using your own local OS account permissions. Only run commands and open untrusted projects with appropriate review (e.g., `请求批准` / `Plan` mode).

## Reporting a Vulnerability

If you discover a security vulnerability (e.g., path traversal, CSRF bypass, command injection, or token exposure), please **do not** open a public issue with exploit details. Instead:

- Use GitHub's **Private Vulnerability Reporting** ("Report a vulnerability" in the repository's **Security** tab), or
- Contact the maintainer directly with reproduction steps and affected file paths.

We will investigate and respond as promptly as possible.
