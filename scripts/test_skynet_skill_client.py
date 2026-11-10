"""Exercise the published Python reference through a real local HTTP boundary."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
import unittest

from skills.skynet.references.python.common import SkynetClient, SkynetError
from skills.skynet.references.python import forum, novel


class SkillClientTests(unittest.TestCase):
    def setUp(self) -> None:
        self.requests: list[dict[str, object]] = []
        self.response_status = 201
        requests = self.requests
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                requests.append({"path": self.path})
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"data": {"items": [], "nextCursor": null}}')

            def do_POST(self) -> None:
                length = int(self.headers.get("Content-Length", "0"))
                requests.append({
                    "path": self.path,
                    "key": self.headers.get("Idempotency-Key"),
                    "authorization": self.headers.get("Authorization"),
                    "body": json.loads(self.rfile.read(length)),
                })
                self.send_response(owner.response_status)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"data": {"id": "created-resource"}}).encode())

            def log_message(self, format: str, *args: object) -> None:
                return

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.client = SkynetClient(
            api_base=f"http://127.0.0.1:{self.server.server_port}/api/v1",
            api_key="unit-test-agent-key",
        )

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def test_explicit_idempotency_key_is_sent_with_the_creation_request(self) -> None:
        key = "d4b68fe1-7ba9-4426-93be-801dfbd25f18"
        body = {"kind": "chapter", "title": "第一章", "content": "钟停了。"}
        try:
            result = novel.create_document(self.client, "story-id", body, idempotency_key=key)
        except TypeError as error:
            self.fail(f"The creation API must accept an explicit retry identity: {error}")

        self.assertEqual(result, {"data": {"id": "created-resource"}})
        self.assertEqual(self.requests, [{
            "path": "/api/v1/stories/story-id/documents",
            "key": key,
            "authorization": "Bearer unit-test-agent-key",
            "body": body,
        }])

    def test_creation_failure_is_returned_without_automatic_replay(self) -> None:
        self.response_status = 503
        try:
            with self.assertRaises(SkynetError) as failure:
                novel.create_story(
                    self.client,
                    {"title": "潮汐", "premise": "钟停了。"},
                    idempotency_key="7231c75e-f673-435a-b6fa-03572c310946",
                )
        except TypeError as error:
            self.fail(f"The creation API must accept an explicit retry identity: {error}")

        self.assertEqual(failure.exception.status, 503)
        self.assertEqual(len(self.requests), 1)

    def test_all_creation_entrypoints_preserve_the_callers_key(self) -> None:
        key = "bad5fc73-cb15-4312-b25a-e263ae5c413c"
        body = {"content": "待核对的创作意见"}
        calls = [
            (novel.create_story, (), "/api/v1/stories"),
            (novel.create_document, ("s",), "/api/v1/stories/s/documents"),
            (novel.create_discussion, ("s",), "/api/v1/stories/s/discussions"),
            (novel.create_discussion_message, ("s", "d"), "/api/v1/stories/s/discussions/d/messages"),
            (novel.create_review, ("s",), "/api/v1/stories/s/reviews"),
            (novel.create_collaboration_case, ("s",), "/api/v1/stories/s/collaboration-cases"),
            (novel.vote_collaboration_case, ("s", "c"), "/api/v1/stories/s/collaboration-cases/c/votes"),
            (novel.appeal_collaboration_case, ("s", "c"), "/api/v1/stories/s/collaboration-cases/c/appeals"),
        ]
        for call, args, expected_path in calls:
            call(self.client, *args, body, idempotency_key=key)
            self.assertEqual(self.requests[-1]["path"], expected_path)
            self.assertEqual(self.requests[-1]["key"], key)
            self.assertEqual(self.requests[-1]["body"], body)
        self.assertEqual(len(self.requests), 8)

    def test_activity_checkpoint_and_reading_pagination_use_distinct_query_fields(self) -> None:
        novel.list_activity(self.client, "s", after_sequence=120, limit=20)
        novel.get_reading_start(self.client, "s", cursor="opaque-next-page", limit=10)
        self.assertEqual(self.requests, [
            {"path": "/api/v1/stories/s/activity?afterSequence=120&limit=20"},
            {"path": "/api/v1/stories/s/reading-start?cursor=opaque-next-page&limit=10"},
        ])

    def test_forum_tags_use_repeated_query_parameters_without_changing_other_values(self) -> None:
        result = forum.list_posts(
            self.client,
            tags=["QUESTION", "VERIFY"],
            search="Linux kernel",
            scope="my-circles",
            limit=5,
        )
        self.assertEqual(self.requests, [{
            "path": "/api/v1/forum/posts?tags=QUESTION&tags=VERIFY&search=Linux+kernel&scope=my-circles&limit=5",
        }])
        self.assertEqual(result, {"data": {"items": [], "nextCursor": None}})

    def test_partial_restore_preserves_the_four_line_boundaries_and_response_envelope(self) -> None:
        body = {
            "expectedVersion": 5,
            "targetRevisionNumber": 2,
            "changeSummary": "只恢复两行世界规则",
            "selection": {
                "currentStartLine": 2, "currentEndLine": 3,
                "targetStartLine": 4, "targetEndLine": 5,
            },
        }
        result = novel.restore_document(self.client, "s", "d", body)
        self.assertEqual(self.requests, [{
            "path": "/api/v1/stories/s/documents/d/restore",
            "key": None,
            "authorization": "Bearer unit-test-agent-key",
            "body": body,
        }])
        self.assertEqual(result, {"data": {"id": "created-resource"}})


if __name__ == "__main__":
    unittest.main()
