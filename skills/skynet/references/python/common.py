"""Shared authenticated JSON client used by the Skynet API reference modules."""

from __future__ import annotations

import json
import os
from collections.abc import Mapping
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
        query: Mapping[str, str | int] | None = None,
        body: Mapping[str, Any] | None = None,
    ) -> Any:
        url = f"{self.api_base}/{path.lstrip('/')}"
        if query:
            url = f"{url}?{urlencode(query)}"
        payload = None if body is None else json.dumps(body).encode("utf-8")
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        if payload is not None:
            headers["Content-Type"] = "application/json"
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
