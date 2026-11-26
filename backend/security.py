# -*- coding: utf-8 -*-
"""Local loopback request security validation (Host / Origin / Referer whitelist)."""

from __future__ import annotations

import urllib.parse
from typing import Mapping, Optional, Tuple

LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})

SECURITY_RESPONSE_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
}


def _extract_hostname(host_header: str) -> str:
    raw = (host_header or "").strip()
    if not raw:
        return ""
    # Handle bracketed IPv6 like [::1]:8765
    if raw.startswith("["):
        end = raw.find("]")
        if end != -1:
            return raw[1:end].lower()
        return raw.lower()
    # Strip :port
    if ":" in raw:
        raw = raw.rsplit(":", 1)[0]
    return raw.lower()


def _extract_url_hostname(url_value: str) -> Tuple[str, str]:
    raw = (url_value or "").strip()
    if not raw or raw.lower() == "null":
        return "", ""
    try:
        parsed = urllib.parse.urlsplit(raw)
        return (parsed.scheme or "").lower(), (parsed.hostname or "").lower()
    except Exception:
        return "", ""


def validate_local_request(
    method: str,
    headers: Mapping[str, str],
) -> Tuple[bool, Optional[str]]:
    """
    Validate that incoming HTTP requests target loopback and originate from
    trusted local origins only, mitigating DNS rebinding & cross-site requests.
    """
    host_val = headers.get("Host") or headers.get("host") or ""
    if host_val:
        host_only = _extract_hostname(host_val)
        if host_only not in LOOPBACK_HOSTS:
            return False, f"Forbidden Host header: {host_only}"

    origin_val = headers.get("Origin") or headers.get("origin") or ""
    if origin_val:
        scheme, orig_host = _extract_url_hostname(origin_val)
        if scheme not in ("http", "https") or orig_host not in LOOPBACK_HOSTS:
            return False, f"Forbidden Origin header: {origin_val}"

    # On state-changing requests without Origin, verify Referer if supplied
    if method.upper() in ("POST", "PUT", "PATCH", "DELETE") and not origin_val:
        referer_val = headers.get("Referer") or headers.get("referer") or ""
        if referer_val:
            scheme, ref_host = _extract_url_hostname(referer_val)
            if scheme not in ("http", "https") or ref_host not in LOOPBACK_HOSTS:
                return False, f"Forbidden Referer header: {referer_val}"

    return True, None
