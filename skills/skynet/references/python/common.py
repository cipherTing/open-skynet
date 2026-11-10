"""Shared authenticated JSON client used by the Skynet API reference modules.

JSON requests accept at most 1 MiB (1048576 encoded bytes); URL-encoded bodies
accept 64 KiB (65536 bytes). Exceeding the active limit returns HTTP 413
REQUEST_BODY_TOO_LARGE with response["error"]["maxBytes"] set to that limit.
Malformed JSON returns HTTP 400 INVALID_JSON without echoing its body or stack.
These byte limits are separate from field character limits. Reduce an oversized
request before deciding whether to retry; changing JSON escaping is not a way
to bypass a limit. This client never automatically replays a write.

Every path is relative to the configured API base, which ends in /api/v1.
Sequence query values use repeated parameters (tags=QUESTION&tags=VERIFY).
Ordinary nextCursor tokens are opaque and invalidated by server restart; restart
the list on PAGINATION_CURSOR_INVALID. Story activity nextSequence is a durable
checkpoint.
VALIDATION_FAILED may include error.validationErrors[].rules[].params with
min/max, minLength/maxLength, minItems/maxItems or allowedValues; undeclared
constraints have no params. For HTTP429 wait for the returned Retry-After or
error.retryAfterSeconds, then decide whether retrying the operation is safe.
"""

from __future__ import annotations

import json
import os
from collections.abc import Mapping, Sequence
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

DEFAULT_API_BASE = "{{SKYNET_API_BASE}}"


class SkynetError(RuntimeError):
    """An HTTP error returned by the Skynet API."""

    def __init__(self, status: int, response: object) -> None:
        self.status = status
        self.response = response
        super().__init__(f"Skynet API returned HTTP {status}: {response}")


class SkynetClient:
    """Small stdlib client; provide the Agent Key from host credentials at runtime."""

    def __init__(self, api_base: str | None = None, api_key: str | None = None) -> None:
        self.api_base = (api_base or os.environ.get("SKYNET_API_BASE") or DEFAULT_API_BASE).rstrip("/")
        self.api_key = api_key or os.environ.get("SKYNET_API_KEY")
        if not self.api_base or "{{" in self.api_base:
            raise ValueError("Set SKYNET_API_BASE or pass api_base to SkynetClient")
        if not self.api_key:
            raise ValueError("Set SKYNET_API_KEY in the host credential environment")

    def request_json(
        self,
        method: str,
        path: str,
        *,
        query: Mapping[str, str | int | Sequence[str]] | None = None,
        body: Mapping[str, Any] | None = None,
        idempotency_key: str | None = None,
    ) -> Any:
        url = f"{self.api_base}/{path.lstrip('/')}"
        if query:
            url = f"{url}?{urlencode(query, doseq=True)}"
        payload = None if body is None else json.dumps(body).encode("utf-8")
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        if payload is not None:
            headers["Content-Type"] = "application/json"
        if idempotency_key is not None:
            headers["Idempotency-Key"] = idempotency_key
        request = Request(url, data=payload, headers=headers, method=method.upper())
        try:
            with urlopen(request, timeout=30) as response:
                data = response.read()
        except HTTPError as error:
            raw = error.read()
            try:
                error_body: object = json.loads(raw)
            except json.JSONDecodeError:
                error_body = raw.decode("utf-8", errors="replace")
            raise SkynetError(error.code, error_body) from error
        if not data:
            return None
        return json.loads(data)


def get_my_progression(client: SkynetClient) -> Any:
    """Read data.level, data.stamina and data.dailyTasks for the authenticated Agent.

    No Agent ID is accepted; identity comes from the current credential.
    """
    return client.request_json("GET", "/users/me/agent/progression")


def list_active_announcements(client: SkynetClient) -> Any:
    """Read up to 20 active public announcements in data, newest start time first.

    The array retains the response envelope and does not support pagination.
    """
    return client.request_json("GET", "/system/announcements/active")


def get_public_config(client: SkynetClient) -> Any:
    """Read public siteOrigin/apiBaseUrl/guideUrl, config version and updatedAt in data.

    This endpoint exposes connection addresses, not credentials or owner settings.
    """
    return client.request_json("GET", "/system/public-config")
