"""The developer's admin pages, behind the same login as /docs (user "admin", password =
ADMIN_TOKEN; open locally with ENABLE_DOCS=true). See app/docs.py.

- /admin: reported AI cards, newest first, each with a "Mark as resolved" button (a plain form,
  so the browser sends its saved login; no JavaScript). The browser tab shows how many are new,
  e.g. "(3) Recap reports".
- GET /admin/reports and POST /admin/reports/{id}/resolve: the same as JSON, listed on /docs.

Not under /v1, so the developer's own clicks don't count toward the app's rate limit.
"""

import html
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

from app import reports
from app.api import EngineDep
from app.docs import require_admin
from app.errors import ApiError

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

REASON_LABELS = {"offensive": "Offensive", "wrong": "Wrong or harmful", "other": "Other"}


class Report(BaseModel):
    id: str
    device_id: str
    front: str
    back: str
    reason: str
    created_at: datetime
    resolved_at: datetime | None


class ReportList(BaseModel):
    open: int
    reports: list[Report]


@router.get("/reports")
def list_reports(engine: EngineDep, include_resolved: bool = False) -> ReportList:
    """Reported AI cards, newest first. `open` counts the ones not resolved yet."""
    open_count, rows = reports.list_reports(engine, include_resolved)
    return ReportList(open=open_count, reports=[Report(**row) for row in rows])


@router.post("/reports/{report_id}/resolve")
def resolve_report(report_id: str, engine: EngineDep) -> dict[str, bool]:
    """Marks a report as dealt with. Resolved reports are deleted after 90 days."""
    if not reports.resolve(engine, report_id):
        raise ApiError(404, "not_found", "There's no report with that id.")
    return {"ok": True}


def _when(value: datetime) -> str:
    if value.tzinfo is None:  # SQLite (local and tests) drops the time zone; it's UTC
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).strftime("%d %b %Y, %H:%M UTC")


def _item(row: dict) -> str:
    e = html.escape
    reason = REASON_LABELS.get(row["reason"], row["reason"])
    if row["resolved_at"]:
        action = f'<span class="meta">Resolved {_when(row["resolved_at"])}</span>'
    else:
        action = (
            f'<form method="post" action="/admin/resolve/{e(row["id"])}">'
            '<button type="submit">Mark as resolved</button></form>'
        )
    return f"""
<article class="report{" done" if row["resolved_at"] else ""}">
  <p class="meta"><span class="tag">{e(reason)}</span> {_when(row["created_at"])} ·
    phone {e(row["device_id"][:8])}</p>
  <p class="label">Front</p><p class="side">{e(row["front"])}</p>
  <p class="label">Back</p><p class="side">{e(row["back"])}</p>
  {action}
</article>"""


PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{title}</title>
<style>
  :root {{ --ink: #1A1530; --muted: #5E5873; --accent: #5A31D6; --line: #E6E3EF; --tint: #EEEAFD; }}
  body {{ margin: 0; background: #fff; color: var(--ink);
    font: 17px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }}
  main {{ max-width: 720px; margin: 0 auto; padding: 32px 20px 64px; }}
  h1 {{ font-size: 30px; margin: 0 0 4px; }}
  a {{ color: var(--accent); }}
  p {{ margin: 4px 0; }}
  .meta {{ color: var(--muted); font-size: 15px; }}
  .report {{ border: 1px solid var(--line); border-radius: 14px; padding: 16px 20px;
    margin: 16px 0; }}
  .done {{ opacity: .6; }}
  .tag {{ background: var(--tint); color: var(--accent); border-radius: 999px; padding: 2px 10px;
    font-weight: 600; }}
  .label {{ margin-top: 12px; font-size: 13px; text-transform: uppercase; letter-spacing: .04em;
    color: var(--muted); }}
  .side {{ white-space: pre-wrap; overflow-wrap: anywhere; }}
  button {{ margin-top: 14px; min-height: 44px; padding: 0 18px; border-radius: 10px;
    border: 1px solid var(--accent); background: #fff; color: var(--accent); font: inherit;
    font-weight: 600; cursor: pointer; }}
  .empty {{ background: var(--tint); border-radius: 14px; padding: 16px 20px; margin: 16px 0; }}
</style>
</head>
<body>
<main>
<h1>Reported cards</h1>
<p class="meta">{summary} · {toggle} · <a href="/docs">API docs</a></p>
{items}
</main>
</body>
</html>
"""


@router.get("", response_class=HTMLResponse, include_in_schema=False)
def reports_page(engine: EngineDep, resolved: bool = False) -> str:
    open_count, rows = reports.list_reports(engine, include_resolved=resolved)
    summary = f"{open_count} new" if open_count else "No new reports"
    toggle = (
        '<a href="/admin">Hide resolved</a>'
        if resolved
        else '<a href="/admin?resolved=1">Show resolved</a>'
    )
    if rows:
        items = "".join(_item(row) for row in rows)
    else:
        items = '<p class="empty">Nothing to look at. Reports from the app show up here.</p>'
    title = f"({open_count}) Recap reports" if open_count else "Recap reports"
    return PAGE.format(title=title, summary=summary, toggle=toggle, items=items)


@router.post("/resolve/{report_id}", include_in_schema=False)
def resolve_from_page(report_id: str, engine: EngineDep) -> RedirectResponse:
    """The page's "Mark as resolved" button; back to the list afterwards."""
    reports.resolve(engine, report_id)
    return RedirectResponse("/admin", status_code=303)
