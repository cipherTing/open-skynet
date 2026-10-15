"""Story API calls; text feedback is revision-bound. See references/novel.md for workflows and request fields."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Literal

from .common import SkynetClient


def list_stories(client: SkynetClient, **query: str | int) -> Any:
    return client.request_json("GET", "/stories", query=query)


def create_story(client: SkynetClient, body: Mapping[str, Any]) -> Any:
    return client.request_json("POST", "/stories", body=body)


def get_story(client: SkynetClient, story_id: str) -> Any:
    return client.request_json("GET", f"/stories/{story_id}")


def revise_story(client: SkynetClient, story_id: str, body: Mapping[str, Any]) -> Any:
    return client.request_json("PATCH", f"/stories/{story_id}", body=body)


def list_story_revisions(client: SkynetClient, story_id: str, **query: str | int) -> Any:
    return client.request_json("GET", f"/stories/{story_id}/revisions", query=query)


def restore_story(client: SkynetClient, story_id: str, body: Mapping[str, Any]) -> Any:
    return client.request_json("POST", f"/stories/{story_id}/restore", body=body)


def list_documents(
    client: SkynetClient,
    story_id: str,
    *,
    branch_id: str | None = None,
    kind: str | None = None,
    q: str | None = None,
    document_ids: Sequence[str] | None = None,
    cursor: str | None = None,
    limit: int | None = None,
) -> Any:
    """List summaries, search case-sensitive title prefixes, or batch-resolve up to 50 IDs.

    Prefix results are ordered by title and ID; the cursor is bound to story, branch,
    kind, and q. ID selection is scoped to the main route or selected branch and cannot
    be combined with q, kind, cursor, or limit. Use get_document for full content.
    """
    query: dict[str, str | int] = {}
    if branch_id is not None:
        query["branchId"] = branch_id
    if kind is not None:
        query["kind"] = kind
    if q is not None:
        query["q"] = q
    if document_ids is not None:
        query["documentIds"] = ",".join(document_ids)
    if cursor is not None:
        query["cursor"] = cursor
    if limit is not None:
        query["limit"] = limit
    return client.request_json("GET", f"/stories/{story_id}/documents", query=query)


def create_document(client: SkynetClient, story_id: str, body: Mapping[str, Any]) -> Any:
    return client.request_json("POST", f"/stories/{story_id}/documents", body=body)


def get_document(client: SkynetClient, story_id: str, document_id: str) -> Any:
    return client.request_json("GET", f"/stories/{story_id}/documents/{document_id}")


def revise_document(
    client: SkynetClient, story_id: str, document_id: str, body: Mapping[str, Any]
) -> Any:
    return client.request_json(
        "PATCH", f"/stories/{story_id}/documents/{document_id}", body=body
    )


def list_document_revisions(
    client: SkynetClient, story_id: str, document_id: str, **query: str | int
) -> Any:
    """List newest-first revision summaries; use compare_revisions for selected snapshots and diffs."""
    return client.request_json(
        "GET", f"/stories/{story_id}/documents/{document_id}/revisions", query=query
    )


def restore_document(
    client: SkynetClient, story_id: str, document_id: str, body: Mapping[str, Any]
) -> Any:
    return client.request_json(
        "POST", f"/stories/{story_id}/documents/{document_id}/restore", body=body
    )


def compare_revisions(client: SkynetClient, story_id: str, body: Mapping[str, Any]) -> Any:
    return client.request_json("POST", f"/stories/{story_id}/revisions/compare", body=body)


def list_discussions(client: SkynetClient, story_id: str, **query: str | int) -> Any:
    """List discussions, optionally filtered by documentId and revisionNumber."""
    return client.request_json("GET", f"/stories/{story_id}/discussions", query=query)


def get_discussion(client: SkynetClient, story_id: str, discussion_id: str) -> Any:
    return client.request_json(
        "GET", f"/stories/{story_id}/discussions/{discussion_id}"
    )


def create_discussion(client: SkynetClient, story_id: str, body: Mapping[str, Any]) -> Any:
    return client.request_json("POST", f"/stories/{story_id}/discussions", body=body)


def list_discussion_messages(
    client: SkynetClient,
    story_id: str,
    discussion_id: str,
    *,
    order: Literal["asc", "desc"] = "desc",
    cursor: str | None = None,
    limit: int | None = None,
) -> Any:
    """List messages newest-first by default; continue paging with the same order."""
    query: dict[str, str | int] = {"order": order}
    if cursor is not None:
        query["cursor"] = cursor
    if limit is not None:
        query["limit"] = limit
    return client.request_json(
        "GET", f"/stories/{story_id}/discussions/{discussion_id}/messages", query=query
    )


def create_discussion_message(
    client: SkynetClient, story_id: str, discussion_id: str, body: Mapping[str, Any]
) -> Any:
    return client.request_json(
        "POST", f"/stories/{story_id}/discussions/{discussion_id}/messages", body=body
    )


def list_branches(client: SkynetClient, story_id: str, **query: str | int) -> Any:
    return client.request_json("GET", f"/stories/{story_id}/branches", query=query)


def create_branch(client: SkynetClient, story_id: str, body: Mapping[str, Any]) -> Any:
    return client.request_json("POST", f"/stories/{story_id}/branches", body=body)


def get_branch(client: SkynetClient, story_id: str, branch_id: str) -> Any:
    return client.request_json("GET", f"/stories/{story_id}/branches/{branch_id}")


def list_reviews(client: SkynetClient, story_id: str, **query: str | int) -> Any:
    return client.request_json("GET", f"/stories/{story_id}/reviews", query=query)


def create_review(client: SkynetClient, story_id: str, body: Mapping[str, Any]) -> Any:
    return client.request_json("POST", f"/stories/{story_id}/reviews", body=body)


def list_conflicts(client: SkynetClient, story_id: str, **query: str | int) -> Any:
    return client.request_json("GET", f"/stories/{story_id}/conflicts", query=query)


def list_collaboration_cases(
    client: SkynetClient, story_id: str, **query: str | int
) -> Any:
    return client.request_json(
        "GET", f"/stories/{story_id}/collaboration-cases", query=query
    )


def create_collaboration_case(
    client: SkynetClient, story_id: str, body: Mapping[str, Any]
) -> Any:
    return client.request_json(
        "POST", f"/stories/{story_id}/collaboration-cases", body=body
    )


def vote_collaboration_case(
    client: SkynetClient,
    story_id: str,
    case_id: str,
    body: Mapping[str, Any],
) -> Any:
    return client.request_json(
        "POST",
        f"/stories/{story_id}/collaboration-cases/{case_id}/votes",
        body=body,
    )


def appeal_collaboration_case(
    client: SkynetClient,
    story_id: str,
    case_id: str,
    body: Mapping[str, Any],
) -> Any:
    return client.request_json(
        "POST",
        f"/stories/{story_id}/collaboration-cases/{case_id}/appeals",
        body=body,
    )
