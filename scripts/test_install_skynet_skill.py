"""Offline tests for the versioned Skynet Skill installer."""

from __future__ import annotations

import argparse
import contextlib
import importlib.util
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.error import URLError
from unittest.mock import patch

SCRIPT_PATH = Path(__file__).with_name("install-skynet-skill.py")
SPEC = importlib.util.spec_from_file_location("install_skynet_skill", SCRIPT_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Unable to load Skill installer")
INSTALLER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(INSTALLER)


class SkillInstallerTests(unittest.TestCase):
    def test_downloads_full_package_and_replaces_instance_urls(self) -> None:
        files = ("SKILL.md", "references/common.py")
        skill_ref = "v1.2.3-rc1"
        content_by_url = {
            f"https://raw.example/{skill_ref}/skills/skynet/{relative}": "origin={{SKYNET_ORIGIN}} api={{SKYNET_API_BASE}}"
            for relative in files
        }

        def read_response(request: object, timeout: int) -> io.BytesIO:
            del timeout
            url = getattr(request, "full_url")
            return io.BytesIO(content_by_url[url].encode("utf-8"))

        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "skills" / "skynet"
            with (
                patch.object(INSTALLER, "RAW_ROOT", "https://raw.example"),
                patch.object(INSTALLER, "FILES", files),
                patch.object(INSTALLER, "urlopen", read_response),
                patch.object(
                    sys,
                    "argv",
                    [
                        str(SCRIPT_PATH),
                        "--skill-ref",
                        skill_ref,
                        "--site-origin",
                        "https://community.example",
                        "--api-base",
                        "https://community.example/api/v1",
                        "--target",
                        str(target),
                    ],
                ),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                INSTALLER.main()

            self.assertEqual(
                (target / "SKILL.md").read_text(encoding="utf-8"),
                "origin=https://community.example api=https://community.example/api/v1",
            )
            self.assertEqual(
                (target / "references/common.py").read_text(encoding="utf-8"),
                "origin=https://community.example api=https://community.example/api/v1",
            )

    def test_download_failure_happens_before_any_package_files_are_written(self) -> None:
        calls = 0

        def fail_download(request: object, timeout: int) -> io.BytesIO:
            nonlocal calls
            del timeout
            calls += 1
            if calls == 1:
                return io.BytesIO(b"downloaded but not yet written")
            raise URLError("network unavailable")

        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "skills" / "skynet"
            with (
                patch.object(INSTALLER, "RAW_ROOT", "https://raw.example"),
                patch.object(INSTALLER, "FILES", ("SKILL.md", "references/common.py")),
                patch.object(INSTALLER, "urlopen", fail_download),
                patch.object(
                    sys,
                    "argv",
                    [
                        str(SCRIPT_PATH),
                        "--skill-ref",
                        "v1.2.3",
                        "--site-origin",
                        "https://community.example",
                        "--api-base",
                        "https://community.example/api/v1",
                        "--target",
                        str(target),
                    ],
                ),
            ):
                with self.assertRaises(RuntimeError):
                    INSTALLER.main()

            self.assertFalse(target.exists())

    def test_default_target_uses_codex_home(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            codex_home = Path(temporary) / "codex-home"
            with (
                patch.dict(os.environ, {"CODEX_HOME": str(codex_home)}),
                patch.object(INSTALLER, "RAW_ROOT", "https://raw.example"),
                patch.object(INSTALLER, "FILES", ("SKILL.md",)),
                patch.object(INSTALLER, "urlopen", lambda request, timeout: io.BytesIO(b"skill")),
                patch.object(
                    sys,
                    "argv",
                    [
                        str(SCRIPT_PATH),
                        "--skill-ref",
                        "v1.2.3",
                        "--site-origin",
                        "https://community.example",
                        "--api-base",
                        "https://community.example/api/v1",
                    ],
                ),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                INSTALLER.main()

            self.assertEqual(
                (codex_home / "skills" / "skynet" / "SKILL.md").read_text(encoding="utf-8"),
                "skill",
            )

    def test_default_codex_home_is_under_user_codex_directory(self) -> None:
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(Path, "home", return_value=Path("/tmp/skynet-installer-home")),
        ):
            self.assertEqual(
                INSTALLER.default_skill_target(),
                Path("/tmp/skynet-installer-home/.codex/skills/skynet"),
            )

    def test_rejects_a_non_version_skill_ref(self) -> None:
        with self.assertRaises(argparse.ArgumentTypeError):
            INSTALLER.valid_skill_ref("v1.2.3/other-branch")


if __name__ == "__main__":
    unittest.main()
