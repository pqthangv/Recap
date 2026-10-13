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
| `POST /v1/report` | `{device_id, front, back, reason: "offensive" \| "wrong" \| "other"}` → 201. Flags an AI card from the app. |
| `GET /admin` | Reported cards, newest first, with "Mark as resolved" (login: `admin` + `ADMIN_TOKEN`). JSON: `GET /admin/reports`, `POST /admin/reports/{id}/resolve`. |
| `GET /privacy`, `GET /support` | The privacy policy and the help page. |

Errors are always `{"error": <code>, "message": <friendly text>}`, e.g. `quota_exceeded` (429),
`ai_busy` (503, after 3 tries with backoff), `too_long` (413), `pdf_no_text` (422).

**How the AI part works.** `app/llm/gemini.py` tries a list of free Gemini/Gemma models in order,
with per-model cooldowns, so one model running out of quota doesn't stop card making. The provider
sits behind a small interface (`app/llm/base.py`), so it can be swapped later. The study material
is never logged: logs record only sizes and counts.

**Abuse limits.** Besides the per-device quota (the phone makes its own random id, so that alone
can't stop a script), each network address gets a daily card limit and a per-minute request limit
(`rate_limited`, `ip_quota_exceeded`), kept in memory. Reports have their own daily limits per
device and per address (`too_many_reports`). The interactive API docs and the admin page are not
public.

**Database.** Postgres in production (SQLite in tests), managed with Alembic. Three tables:
`devices(id, created_at)`, `ai_usage(device_id, day, cards_generated)` (the day is the UTC date) and
`ai_reports(id, device_id, front, back, reason, created_at, resolved_at)` (resolved reports are
deleted after 90 days).

Tests (`pytest`) use an in-memory SQLite database and never call Gemini (it's mocked).
