from fastapi.testclient import TestClient

import app.db
from app.main import app as fastapi_app


def test_health_never_touches_the_database(monkeypatch):
    def no_database():
        raise AssertionError("/health must not use the database")

    monkeypatch.setattr(app.db, "get_engine", no_database)
    app.db.set_engine(None)
    with TestClient(fastapi_app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_endpoints_explain_a_missing_database():
    app.db.set_engine(None)  # DATABASE_URL is empty in tests
    with TestClient(fastapi_app) as client:
        response = client.get(
            "/v1/quota", params={"device_id": "6f1c2b9e-3d4a-4e5f-8a7b-1c2d3e4f5a6b"}
        )
    assert response.status_code == 503
    assert response.json()["error"] == "not_configured"


def test_privacy_policy_is_public():
    with TestClient(fastapi_app) as client:
        response = client.get("/privacy")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Recap privacy policy" in response.text
    assert "recap.flashcards@gmail.com" in response.text


def test_support_page_is_public():
    with TestClient(fastapi_app) as client:
        response = client.get("/support")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Recap support" in response.text
    assert "recap.flashcards@gmail.com" in response.text
    assert 'href="/privacy"' in response.text


def test_ip_addresses_are_not_logged():
    """Uvicorn's access log prints each caller's address; the privacy policy says Recap never logs
    IP addresses, so the app's logging setup turns it off (and render.yaml starts uvicorn with
    --no-access-log)."""
    import logging

    from app.logs import setup_logging

    access = logging.getLogger("uvicorn.access")
    # Alembic's logging config (the tests run migrations) switches existing loggers back on.
    access.disabled = False
    setup_logging("INFO")
    assert access.disabled
