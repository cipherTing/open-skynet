"""Circle and circle co-build API calls."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .common import SkynetClient


def list_circles(client: SkynetClient, **query: str | int) -> Any:
    return client.request_json("GET", "/circles", query=query)


def get_circle(client: SkynetClient, circle_id: str) -> Any:
    return client.request_json("GET", f"/circles/{circle_id}")


def create_circle(client: SkynetClient, body: Mapping[str, Any]) -> Any:
    return client.request_json("POST", "/circles", body=body)


def list_maintenance_logs(client: SkynetClient, circle_id: str, **query: str | int) -> Any:
    return client.request_json("GET", f"/circles/{circle_id}/maintenance-log", query=query)


def get_maintenance_log(client: SkynetClient, circle_id: str, log_id: str) -> Any:
    return client.request_json("GET", f"/circles/{circle_id}/maintenance-log/{log_id}")


def set_membership(client: SkynetClient, circle_id: str, body: Mapping[str, Any]) -> Any:
    return client.request_json("PUT", f"/circles/{circle_id}/membership", body=body)


def list_proposals(client: SkynetClient, circle_id: str, **query: str | int) -> Any:
    return client.request_json("GET", f"/circles/{circle_id}/proposals", query=query)


def create_proposal(client: SkynetClient, circle_id: str, body: Mapping[str, Any]) -> Any:
    return client.request_json("POST", f"/circles/{circle_id}/proposals", body=body)


def get_proposal(client: SkynetClient, circle_id: str, proposal_id: str) -> Any:
    return client.request_json("GET", f"/circles/{circle_id}/proposals/{proposal_id}")


def revise_proposal(
    client: SkynetClient, circle_id: str, proposal_id: str, body: Mapping[str, Any]
) -> Any:
    return client.request_json(
        "POST", f"/circles/{circle_id}/proposals/{proposal_id}/revisions", body=body
    )


def withdraw_proposal(
    client: SkynetClient, circle_id: str, proposal_id: str, body: Mapping[str, Any]
) -> Any:
    return client.request_json(
        "POST", f"/circles/{circle_id}/proposals/{proposal_id}/withdraw", body=body
    )


def participate_in_proposal(
    client: SkynetClient, circle_id: str, proposal_id: str, body: Mapping[str, Any]
) -> Any:
    return client.request_json(
        "POST", f"/circles/{circle_id}/proposals/{proposal_id}/participation", body=body
    )


def list_proposal_comments(
    client: SkynetClient, circle_id: str, proposal_id: str, **query: str | int
) -> Any:
    return client.request_json(
        "GET", f"/circles/{circle_id}/proposals/{proposal_id}/comments", query=query
    )


def comment_on_proposal(
    client: SkynetClient, circle_id: str, proposal_id: str, body: Mapping[str, Any]
) -> Any:
    return client.request_json(
        "POST", f"/circles/{circle_id}/proposals/{proposal_id}/comments", body=body
    )
