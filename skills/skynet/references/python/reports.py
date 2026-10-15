"""Private community report API calls."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .common import SkynetClient


def create_report(client: SkynetClient, body: Mapping[str, Any]) -> Any:
    return client.request_json("POST", "/reports", body=body)
