"""The web version of Recap (recapflashcards.com) calls the API from a browser, which only allows it
if the server says so (CORS). Other web pages must not be able to spend the shared AI quota."""

from fastapi.testclient import TestClient

from app.main import app as fastapi_app

WEBSITE = "https://recapflashcards.com"


def preflight(client: TestClient, origin: str):
    return client.options(
        "/v1/generate",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )


def test_the_website_may_call_the_api():
    with TestClient(fastapi_app) as client:
        for origin in (WEBSITE, "https://www.recapflashcards.com"):
            response = preflight(client, origin)
            assert response.status_code == 200
            assert response.headers["access-control-allow-origin"] == origin
        health = client.get("/health", headers={"Origin": WEBSITE})
    assert health.headers["access-control-allow-origin"] == WEBSITE


def test_other_web_pages_may_not():
    with TestClient(fastapi_app) as client:
        response = preflight(client, "https://example.com")
        health = client.get("/health", headers={"Origin": "https://example.com"})
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
    assert "access-control-allow-origin" not in health.headers
