"""Reporting AI cards from the app (Google Play's AI-Generated Content policy) and reading the
reports on the admin page."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, update

from app import reports
from app.config import get_settings
from app.models import AiReport, Device
from tests.conftest import DEVICE
from tests.test_abuse import OTHER_DEVICE

ADMIN = ("admin", "s3cret-token")


@pytest.fixture
def admin(monkeypatch):
    monkeypatch.setattr(get_settings(), "admin_token", ADMIN[1])


def report(client, device=DEVICE, ip="203.0.113.7", **fields):
    body = {"device_id": device, "front": "Capital of France?", "back": "Paris", "reason": "wrong"}
    return client.post("/v1/report", json={**body, **fields}, headers={"cf-connecting-ip": ip})


def stored(engine):
    with engine.connect() as conn:
        return conn.execute(select(AiReport.__table__)).mappings().all()


def test_a_report_is_stored_with_the_card_and_reason(client, engine):
    response = report(client, front="  Bad front ", back="Bad back", reason="offensive")
    assert response.status_code == 201
    assert response.json() == {"ok": True}
    [row] = stored(engine)
    assert (row["device_id"], row["front"], row["back"], row["reason"]) == (
        DEVICE,
        "Bad front",
        "Bad back",
        "offensive",
    )
    assert row["resolved_at"] is None


def test_a_phone_that_never_made_cards_can_still_report(client, engine):
    assert report(client, device=OTHER_DEVICE).status_code == 201
    with engine.connect() as conn:
        assert conn.execute(select(Device.id)).scalars().all() == [OTHER_DEVICE]


def test_reports_are_checked(client, engine):
    assert report(client, reason="spam").json()["error"] == "invalid_request"
    assert report(client, device="not-a-uuid").status_code == 422
    assert report(client, front="x" * (reports.MAX_FRONT_CHARS + 1)).status_code == 422
    empty = report(client, front=" ", back="")
    assert (empty.status_code, empty.json()["error"]) == (422, "empty")
    assert stored(engine) == []


def test_one_phone_can_only_send_so_many_reports_a_day(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "daily_report_quota", 2)
    assert [report(client).status_code for _ in range(2)] == [201, 201]
    limited = report(client)
    assert (limited.status_code, limited.json()["error"]) == (429, "too_many_reports")
    assert report(client, device=OTHER_DEVICE).status_code == 201  # other phones still can


def test_inventing_device_ids_hits_the_per_address_report_limit(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "ip_daily_report_quota", 2)
    assert report(client, device=DEVICE).status_code == 201
    assert report(client, device=OTHER_DEVICE).status_code == 201
    third = report(client, device="11111111-2222-4333-8444-555555555555")
    assert third.json()["error"] == "too_many_reports"
    assert report(client, ip="192.0.2.50").status_code == 201  # another network still works


def test_the_report_text_is_never_logged(client, caplog):
    report(client, front="SECRET-FRONT", back="SECRET-BACK")
    assert "ai card reported" in caplog.text
    assert "SECRET" not in caplog.text


def test_admin_pages_need_the_admin_token(client):
    # No ADMIN_TOKEN (and no ENABLE_DOCS): the pages don't exist.
    assert client.get("/admin").status_code == 404
    assert client.get("/admin/reports").status_code == 404


def test_admin_pages_ask_for_a_login(client, admin):
    for path in ("/admin", "/admin/reports"):
        missing = client.get(path)
        assert missing.status_code == 401
        assert missing.headers["www-authenticate"].startswith("Basic")
        assert client.get(path, auth=("admin", "wrong")).status_code == 401
    assert client.post("/admin/reports/x/resolve").status_code == 401


def test_admin_sees_new_reports_newest_first_and_resolves_them(client, engine, admin):
    report(client, front="Older")
    report(client, front="Newer")
    with engine.begin() as conn:  # make the order certain
        conn.execute(
            update(AiReport)
            .where(AiReport.front == "Older")
            .values(created_at=datetime.now(UTC) - timedelta(hours=1))
        )
    listing = client.get("/admin/reports", auth=ADMIN).json()
    assert listing["open"] == 2
    assert [r["front"] for r in listing["reports"]] == ["Newer", "Older"]

    newer = listing["reports"][0]["id"]
    assert client.post(f"/admin/reports/{newer}/resolve", auth=ADMIN).json() == {"ok": True}
    listing = client.get("/admin/reports", auth=ADMIN).json()
    assert listing["open"] == 1
    assert [r["front"] for r in listing["reports"]] == ["Older"]
    everything = client.get("/admin/reports?include_resolved=true", auth=ADMIN).json()
    assert [r["front"] for r in everything["reports"]] == ["Newer", "Older"]
    assert everything["reports"][0]["resolved_at"] is not None

    missing = client.post("/admin/reports/no-such-id/resolve", auth=ADMIN)
    assert (missing.status_code, missing.json()["error"]) == (404, "not_found")


def test_admin_page_lists_reports_safely(client, admin):
    report(client, front="<script>alert(1)</script>", back="Tom & Jerry", reason="offensive")
    page = client.get("/admin", auth=ADMIN)
    assert page.status_code == 200
    assert page.headers["content-type"].startswith("text/html")
    assert "<title>(1) Recap reports</title>" in page.text  # the tab shows how many are new
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in page.text
    assert "<script>alert(1)" not in page.text
    assert "Tom &amp; Jerry" in page.text
    assert "Offensive" in page.text
    assert "Mark as resolved" in page.text


def test_admin_page_when_there_is_nothing_new(client, admin):
    page = client.get("/admin", auth=ADMIN)
    assert "<title>Recap reports</title>" in page.text
    assert "No new reports" in page.text


def test_resolved_reports_are_deleted_after_a_while(client, engine, admin):
    report(client, front="Old")
    report(client, front="Recent")
    long_ago = datetime.now(UTC) - timedelta(days=reports.RESOLVED_KEEP_DAYS + 1)
    with engine.begin() as conn:
        conn.execute(update(AiReport).where(AiReport.front == "Old").values(resolved_at=long_ago))
        conn.execute(
            update(AiReport)
            .where(AiReport.front == "Recent")
            .values(resolved_at=datetime.now(UTC) - timedelta(days=1))
        )
    client.get("/admin", auth=ADMIN)
    assert [row["front"] for row in stored(engine)] == ["Recent"]


def test_admin_routes_are_in_the_api_docs(client, admin):
    schema = client.get("/openapi.json", auth=ADMIN).json()
    assert "/v1/report" in schema["paths"]
    assert "/admin/reports" in schema["paths"]
    assert "/admin" not in schema["paths"]  # the HTML page isn't an API


def test_the_page_button_resolves_and_goes_back_to_the_list(client, engine, admin):
    report(client, front="Bad card")
    [row] = stored(engine)
    page = client.get("/admin", auth=ADMIN).text
    assert f'action="/admin/resolve/{row["id"]}"' in page  # a plain form: no JavaScript needed
    assert "<script" not in page
    assert client.post(f"/admin/resolve/{row['id']}").status_code == 401  # login needed
    done = client.post(f"/admin/resolve/{row['id']}", auth=ADMIN, follow_redirects=False)
    assert (done.status_code, done.headers["location"]) == (303, "/admin")
    assert stored(engine)[0]["resolved_at"] is not None
    assert "No new reports" in client.get("/admin", auth=ADMIN).text
