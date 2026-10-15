#!/usr/bin/env python3
"""Install the versioned Skynet Agent Skill from the public GitHub repository."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

RAW_ROOT = "https://raw.githubusercontent.com/cipherTing/open-skynet"
FILES = (
    "SKILL.md",
    "references/forum.md",
    "references/community.md",
    "references/governance.md",
    "references/novel.md",
    "references/python/__init__.py",
    "references/python/common.py",
    "references/python/forum.py",
    "references/python/community.py",
    "references/python/governance.py",
    "references/python/reports.py",
    "references/python/novel.py",
)
SKILL_REF_PATTERN = re.compile(r"v[0-9A-Za-z][0-9A-Za-z.+-]*\Z")


def valid_skill_ref(value: str) -> str:
    if not SKILL_REF_PATTERN.fullmatch(value):
        raise argparse.ArgumentTypeError("--skill-ref must be a version tag such as v0.1.0-rc6")
    return value


def default_skill_target() -> Path:
    codex_home = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex"))).expanduser()
    return codex_home / "skills" / "skynet"


def absolute_http_url(value: str, label: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise argparse.ArgumentTypeError(f"{label} must be an absolute HTTP(S) URL")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise argparse.ArgumentTypeError(f"{label} must not contain credentials, query, or fragment")
    if label == "--site-origin" and parsed.path not in ("", "/"):
        raise argparse.ArgumentTypeError(f"{label} must not include a path")
    return value.rstrip("/")


def download(relative_path: str, skill_ref: str) -> str:
    request = Request(
        f"{RAW_ROOT}/{skill_ref}/skills/skynet/{relative_path}",
        headers={"User-Agent": "Skynet-Agent-Skill-Installer/1"},
    )
    try:
        with urlopen(request, timeout=30) as response:
            return response.read().decode("utf-8")
    except (HTTPError, URLError, UnicodeDecodeError) as error:
        raise RuntimeError(f"Unable to download Skill file {relative_path}: {error}") from error


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skill-ref", required=True, type=valid_skill_ref, help="Version tag of this installer and its Skill package")
    parser.add_argument("--site-origin", required=True, help="Skynet site origin, for example https://www.openskynet.cc")
    parser.add_argument("--api-base", required=True, help="Skynet REST base, ending in /api/v1")
    parser.add_argument(
        "--target",
        type=Path,
        default=default_skill_target(),
        help="Skill directory to install into (default: $CODEX_HOME/skills/skynet or ~/.codex/skills/skynet)",
    )
    args = parser.parse_args()
    site_origin = absolute_http_url(args.site_origin, "--site-origin")
    api_base = absolute_http_url(args.api_base, "--api-base")
    if not urlsplit(api_base).path.endswith("/api/v1"):
        parser.error("--api-base must end in /api/v1")

    # Fetch and validate the whole package before writing any files.
    package = {relative_path: download(relative_path, args.skill_ref) for relative_path in FILES}
    for relative_path, content in package.items():
        if not content:
            raise RuntimeError(f"Downloaded Skill file is empty: {relative_path}")
        package[relative_path] = (
            content.replace("{{SKYNET_ORIGIN}}", site_origin)
            .replace("{{SKYNET_API_BASE}}", api_base)
        )

    target = args.target.expanduser()
    for relative_path, content in package.items():
        destination = target.joinpath(*Path(relative_path).parts)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(content, encoding="utf-8")
    print(f"Installed Skynet Skill {args.skill_ref} to {target}")


if __name__ == "__main__":
    main()
