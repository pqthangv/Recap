from tests.conftest import DEVICE
from tests.pdfs import make_pdf


def upload(client, data: bytes, name: str = "notes.pdf"):
    return client.post(
        "/v1/extract-pdf",
        data={"device_id": DEVICE},
        files={"file": (name, data, "application/pdf")},
    )


def test_extracts_text_from_a_pdf(client):
    response = upload(client, make_pdf(["Mitochondria make ATP.", "Ribosomes make proteins."]))
    assert response.status_code == 200
    body = response.json()
    assert "Mitochondria make ATP." in body["text"]
    assert "Ribosomes make proteins." in body["text"]
    assert body["pages"] == 1
    assert body["truncated"] is False


def test_explains_pdfs_without_text(client):
    response = upload(client, make_pdf([]))
    assert response.status_code == 422
    assert response.json()["error"] == "pdf_no_text"


def test_rejects_files_that_are_not_pdfs(client):
    response = upload(client, b"hello, not a pdf", name="notes.txt")
    assert response.json()["error"] == "bad_pdf"
    broken = upload(client, b"%PDF-1.4\nthis is not really a pdf")
    assert broken.json()["error"] == "bad_pdf"


def test_rejects_pdfs_over_10_mb(client):
    response = upload(client, b"%PDF" + b"0" * (10 * 1024 * 1024 + 70_000))
    assert response.status_code == 413
    assert response.json()["error"] == "too_large"


def test_long_pdfs_are_cut_to_the_input_limit(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "max_input_chars", 30)
    body = upload(client, make_pdf(["A fairly long first line of notes.", "Second line."])).json()
    assert len(body["text"]) <= 30
    assert body["truncated"] is True


def test_word_per_line_text_is_recognised():
    from app.pdf import looks_scattered, tidy

    # What pypdf's default mode gave for a real exam PDF: one word per line.
    scattered = "\n \n".join(
        ["Wednesday,", "October", "14,", "2026", "Instructor:", "Cynthia", "Bailey", "CS106B"] * 3
    )
    assert looks_scattered(scattered)
    normal = "\n".join(["Mitochondria make ATP for the cell."] * 30)
    assert not looks_scattered(normal)
    assert not looks_scattered("Short\nnote")  # too little to judge
    assert tidy("  a   b \n\n\n\n c\t\td ") == "a b\n\nc d"
