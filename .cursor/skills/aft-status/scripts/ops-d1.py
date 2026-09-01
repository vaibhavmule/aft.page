#!/usr/bin/env python3
"""Founder ops numbers from prod D1. ops.aft.page 302 is the HTML cookie gate, not this."""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from math import ceil
from pathlib import Path

# Same as apps/api/wrangler.jsonc vars.OPS_EMAILS + isInternalUserEmail.
OPS_EMAILS = {"hello@aft.page", "vaibhavmule135@gmail.com"}
ROOT = "aft.page"


def is_internal(email: str) -> bool:
    e = (email or "").strip().lower()
    if not e:
        return False
    if e in OPS_EMAILS or e.endswith("@" + ROOT):
        return True
    at = e.rfind("@")
    if at < 1:
        return False
    local, domain = e[:at], e[at + 1 :]
    plus = local.find("+")
    if plus < 1:
        return False
    return (local[:plus] + "@" + domain) in OPS_EMAILS


def percentile_nearest(sorted_vals: list[int], p: int) -> int | None:
    if not sorted_vals:
        return None
    rank = ceil((p / 100) * len(sorted_vals)) - 1
    return sorted_vals[min(len(sorted_vals) - 1, max(0, rank))]


def iso_ago(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).strftime(
        "%Y-%m-%dT%H:%M:%S.000Z"
    )


def wrangler_json(api: Path, sql: str) -> list:
    r = subprocess.run(
        [
            "npx",
            "wrangler",
            "d1",
            "execute",
            "aft-page",
            "--remote",
            "--json",
            "--command",
            sql,
        ],
        cwd=api,
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        sys.stderr.write(r.stderr or r.stdout or "wrangler d1 failed\n")
        sys.exit(1)
    raw = r.stdout.strip()
    # wrangler prints log lines before JSON
    start = raw.find("[")
    if start < 0:
        start = raw.find("{")
    data = json.loads(raw[start:])
    if isinstance(data, list) and data:
        return data[0].get("results") or []
    if isinstance(data, dict):
        return data.get("results") or []
    return []


def fmt_ms(ms: int | None) -> str:
    if ms is None:
        return "—"
    if ms < 1000:
        return f"{ms}ms"
    return f"{ms / 1000:.1f}s"


def rate(ok: int, fail: int) -> str:
    n = ok + fail
    if n == 0:
        return "n=0"
    return f"{100.0 * ok / n:.0f}% ({ok} ok / {fail} fail)"


def main() -> None:
    api = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    s24, s7 = iso_ago(1), iso_ago(7)

    counts = wrangler_json(
        api,
        f"""
        SELECT
          (SELECT COUNT(*) FROM sites WHERE slug NOT LIKE 'test--%') AS sites,
          (SELECT COUNT(*) FROM sites WHERE owner_user_id IS NOT NULL AND slug NOT LIKE 'test--%') AS claimed,
          (SELECT COUNT(*) FROM users) AS users,
          (SELECT COUNT(*) FROM waitlist_signups) AS waitlist,
          (SELECT COUNT(*) FROM deploys) AS deploys,
          (SELECT COUNT(*) FROM deploys WHERE created_at >= '{s24}') AS ok24,
          (SELECT COUNT(*) FROM deploy_failures WHERE created_at >= '{s24}') AS fail24,
          (SELECT COUNT(*) FROM deploys WHERE created_at >= '{s7}') AS ok7,
          (SELECT COUNT(*) FROM deploy_failures WHERE created_at >= '{s7}') AS fail7,
          (SELECT COUNT(*) FROM custom_domains) AS domains,
          (SELECT COUNT(*) FROM users WHERE custom_domains = 'requested') AS domain_requests
        """,
    )
    users = wrangler_json(
        api,
        """
        SELECT u.email, u.created_at, u.custom_domains,
               COALESCE(s.n, 0) AS sites
        FROM users u
        LEFT JOIN (
          SELECT owner_user_id, COUNT(*) AS n FROM sites
          WHERE owner_user_id IS NOT NULL AND slug NOT LIKE 'test--%'
          GROUP BY owner_user_id
        ) s ON s.owner_user_id = u.id
        ORDER BY u.created_at DESC
        """,
    )
    ms24 = wrangler_json(
        api,
        f"SELECT ms FROM deploys WHERE ms IS NOT NULL AND created_at >= '{s24}'",
    )
    ms7 = wrangler_json(
        api,
        f"SELECT ms FROM deploys WHERE ms IS NOT NULL AND created_at >= '{s7}'",
    )
    top_fail = wrangler_json(
        api,
        f"""
        SELECT error, COUNT(*) AS n FROM deploy_failures
        WHERE created_at >= '{s7}'
        GROUP BY error ORDER BY n DESC LIMIT 5
        """,
    )

    c = counts[0] if counts else {}
    v24 = sorted(int(r["ms"]) for r in ms24)
    v7 = sorted(int(r["ms"]) for r in ms7)
    ext = [u for u in users if not is_internal(u.get("email") or "")]
    internal_n = len(users) - len(ext)

    print(f"sites {c.get('sites')} claimed {c.get('claimed')} users {c.get('users')} waitlist {c.get('waitlist')} domains {c.get('domains')} requested {c.get('domain_requests')}")
    print(f"24h {rate(int(c.get('ok24') or 0), int(c.get('fail24') or 0))}  T2U n={len(v24)} p50={fmt_ms(percentile_nearest(v24, 50))} p95={fmt_ms(percentile_nearest(v24, 95))}")
    print(f"7d  {rate(int(c.get('ok7') or 0), int(c.get('fail7') or 0))}  T2U n={len(v7)} p50={fmt_ms(percentile_nearest(v7, 50))} p95={fmt_ms(percentile_nearest(v7, 95))}")
    if top_fail:
        print("top fail 7d: " + ", ".join(f"{r.get('error')}×{r.get('n')}" for r in top_fail))
    else:
        print("top fail 7d: none")
    print(f"users internal {internal_n} external {len(ext)}")
    for u in ext:
        joined = (u.get("created_at") or "")[:10]
        print(f"  {u.get('email')}  sites={u.get('sites')}  domains={u.get('custom_domains') or 'none'}  joined {joined}")
    print("CF cost is GraphQL/KV — not in D1. Omit unless ops /api.json was pasted.")


if __name__ == "__main__":
    main()
