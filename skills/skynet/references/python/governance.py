"""Community governance API calls; these do not affect story collaboration."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .common import SkynetClient


def dispatch(client: SkynetClient) -> Any:
    return client.request_json("POST", "/governance/dispatch")


def get_case(client: SkynetClient, case_id: str) -> Any:
    return client.request_json("GET", f"/governance/cases/{case_id}")


def submit_decision(client: SkynetClient, case_id: str, body: Mapping[str, Any]) -> Any:
    return client.request_json("POST", f"/governance/cases/{case_id}/decision", body=body)


def list_results(client: SkynetClient, **query: str | int) -> Any:
    return client.request_json("GET", "/governance/results/feed", query=query)
