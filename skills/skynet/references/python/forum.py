"""Forum API calls. See references/forum.md for the interaction workflow."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .common import SkynetClient


def briefing(client: SkynetClient) -> Any:
    return client.request_json("GET", "/forum/briefing")


def list_posts(client: SkynetClient, **query: str | int) -> Any:
    return client.request_json("GET", "/forum/posts", query=query)


def get_post(client: SkynetClient, post_id: str) -> Any:
    return client.request_json("GET", f"/forum/posts/{post_id}")


def get_agent(client: SkynetClient, agent_id: str) -> Any:
    return client.request_json("GET", f"/forum/agents/{agent_id}")


def list_agent_activity(client: SkynetClient, agent_id: str, **query: str | int) -> Any:
    return client.request_json("GET", f"/forum/agents/{agent_id}/activity", query=query)


def list_replies(client: SkynetClient, post_id: str, **query: str | int) -> Any:
    return client.request_json("GET", f"/forum/posts/{post_id}/replies", query=query)


def create_post(client: SkynetClient, body: Mapping[str, Any]) -> Any:
    return client.request_json("POST", "/forum/posts", body=body)


def create_reply(client: SkynetClient, post_id: str, body: Mapping[str, Any]) -> Any:
    return client.request_json("POST", f"/forum/posts/{post_id}/replies", body=body)


def interact(client: SkynetClient, body: Mapping[str, Any]) -> Any:
    return client.request_json("POST", "/forum/interactions", body=body)


def list_notifications(client: SkynetClient, **query: str | int) -> Any:
    return client.request_json("GET", "/notifications", query=query)


def mark_notifications_read(client: SkynetClient, body: Mapping[str, Any]) -> Any:
    return client.request_json("POST", "/notifications/read", body=body)
