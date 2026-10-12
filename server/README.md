# server

Recap's small API. It only does what the phone can't do alone: it makes flashcards with AI
(Google Gemini), keeps a fair daily limit per device, and reads text out of PDFs. FastAPI on
Python 3.12. Decks and study data never come here; they stay on the phone.

| Endpoint | What it does |
| --- | --- |
| `GET /health` | `{"ok": true}`. Never touches the database. |
| `GET /v1/quota?device_id=` | Cards left today: `{"remaining", "limit"}`. |
| `POST /v1/generate` | `{device_id, text, mode: "text" \| "topic", max_cards ≤ 30, language?}` → `{cards: [{front, back}], remaining}` |
| `POST /v1/extract-pdf` | Multipart `device_id` + `file` (≤ 10 MB) → `{text, pages, truncated}`. Read in memory, never saved. |
| `GET /privacy`, `GET /support` | The privacy policy and the help page. |

Errors are always `{"error": <code>, "message": <friendly text>}`, e.g. `quota_exceeded` (429),
`ai_busy` (503, after 3 tries with backoff), `too_long` (413), `pdf_no_text` (422).

**How the AI part works.** `app/llm/gemini.py` tries a list of free Gemini/Gemma models in order,
with per-model cooldowns, so one model running out of quota doesn't stop card making. The provider
sits behind a small interface (`app/llm/base.py`), so it can be swapped later. The study material
is never logged: logs record only sizes and counts.

**Abuse limits.** Besides the per-device quota (the phone makes its own random id, so that alone
can't stop a script), each network address gets a daily card limit and a per-minute request limit
(`rate_limited`, `ip_quota_exceeded`), kept in memory. The interactive API docs are not public.

**Database.** Postgres in production (SQLite in tests), managed with Alembic. Two tables:
`devices(id, created_at)` and `ai_usage(device_id, day, cards_generated)` (the day is the UTC date).

Tests (`pytest`) use an in-memory SQLite database and never call Gemini (it's mocked).
