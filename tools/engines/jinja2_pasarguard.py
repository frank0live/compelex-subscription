#!/usr/bin/env python3
"""Render a Row-Template shell the way PasarGuard renders its subscription page.

TEST TOOLING. Nothing here ships in a release, and nothing here is PasarGuard's
code: PasarGuard is AGPL-3.0 and Row-Template is MIT, so this is an independent
implementation of the behaviour PasarGuard documents and exhibits, written from
the audit in docs/design/PASARGUARD-ADAPTER-AUDIT.md. The ENGINE is the real
one -- the installed Jinja2 package -- configured the way PasarGuard configures
it:

  * jinja2.Environment(loader=FileSystemLoader([...]))  -- NOT sandboxed, and
    with Jinja2's default autoescape, which is OFF. A shell that relies on the
    engine to escape its values is therefore unsafe on PasarGuard; this harness
    exists partly to prove the shell escapes for itself.
  * extra filters: bytesformat, datetime, yaml, except, only
  * a global now() returning the current time as an aware UTC datetime

The page context is { user, links, announce, announce_url, apps }, where
`user` is PasarGuard's subscription user model: attribute access, a
str-valued Enum for `status`, aware datetimes for `online_at`, a datetime for
`expire`, and an `admin` object that may be None.

Usage:
    python jinja2_pasarguard.py JOBS.json

JOBS.json is [{"template": PATH, "context": {...}, "out": PATH}, ...]. The
context's datetimes are ISO strings; `now` (ISO, optional) pins now() so a
render is reproducible. The first failure is printed and the exit code is 1.
"""

import enum
import json
import math
import os
import sys
from datetime import datetime, timezone

try:
    from jinja2 import Environment, FileSystemLoader
except ImportError:  # pragma: no cover - reported to the caller
    sys.stderr.write("jinja2 is not installed (pip install jinja2)\n")
    sys.exit(3)


class UserStatus(str, enum.Enum):
    active = "active"
    disabled = "disabled"
    limited = "limited"
    expired = "expired"
    on_hold = "on_hold"


class Obj:
    """Attribute access over a dict; a missing attribute raises AttributeError,
    which Jinja2 turns into Undefined -- the same thing a pydantic model does
    for an attribute it does not have."""

    def __init__(self, fields):
        self.__dict__.update(fields)


def readable_size(size_bytes):
    if not size_bytes or size_bytes <= 0:
        return "0 B"
    names = ("B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB")
    i = math.floor(math.log(size_bytes, 1024))
    p = math.pow(1024, i)
    return f"{round(size_bytes / p, 2)} {names[i]}"


def datetimeformat(value):
    if isinstance(value, int):
        value = datetime.fromtimestamp(value, tz=timezone.utc)
    return value.strftime("%Y-%m-%d %H:%M:%S")


def parse_dt(value, aware=True):
    if value is None:
        return None
    dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if aware and dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    if not aware:
        dt = dt.replace(tzinfo=None)
    return dt


def build_user(raw):
    fields = dict(raw)
    fields["status"] = UserStatus(fields.get("status", "active"))
    for key in ("online_at", "created_at", "edit_at", "on_hold_timeout"):
        if key in fields:
            fields[key] = parse_dt(fields[key])
    # expire reaches the template as the database value: a datetime, naive when
    # the database stores it without a zone (the fixture says which).
    if fields.get("expire") is not None and not isinstance(fields["expire"], int):
        fields["expire"] = parse_dt(fields["expire"], aware=not fields.pop("expire_naive", False))
    else:
        fields.pop("expire_naive", None)
    admin = fields.get("admin")
    fields["admin"] = Obj(admin) if isinstance(admin, dict) else None
    return Obj(fields)


def render(job):
    template_path = job["template"]
    ctx = dict(job.get("context") or {})
    pinned = parse_dt(ctx.pop("now", None))
    env = Environment(loader=FileSystemLoader([os.path.dirname(template_path)]))
    env.filters.update({
        "datetime": datetimeformat,
        "bytesformat": readable_size,
        "except": lambda obj, *keys: {k: v for k, v in obj.items() if k not in keys},
        "only": lambda obj, *keys: {k: v for k, v in obj.items() if k in keys},
        "yaml": lambda obj: "" if not obj else json.dumps(obj),
    })
    env.globals["now"] = (lambda: pinned) if pinned else (lambda: datetime.now(timezone.utc))
    context = {
        "user": build_user(ctx.get("user") or {}),
        "links": list(ctx.get("links") or []),
        "announce": ctx.get("announce", ""),
        "announce_url": ctx.get("announce_url", ""),
        "apps": list(ctx.get("apps") or []),
    }
    html = env.get_template(os.path.basename(template_path)).render(context)
    with open(job["out"], "w", encoding="utf-8", newline="") as fh:
        fh.write(html)


def main(argv):
    if len(argv) != 2:
        sys.stderr.write("usage: jinja2_pasarguard.py JOBS.json\n")
        return 2
    with open(argv[1], encoding="utf-8") as fh:
        jobs = json.load(fh)
    for job in jobs:
        try:
            render(job)
        except Exception as exc:  # noqa: BLE001 - any failure is the answer
            sys.stderr.write(f"{job.get('template')}: {type(exc).__name__}: {exc}\n")
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
