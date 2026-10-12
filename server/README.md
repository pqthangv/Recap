# server

Recap's API: makes flashcards with AI (Google Gemini, free tier), enforces a per-device daily
quota, and reads text out of PDFs. FastAPI on Python 3.12. Decks and study data never come here;
they stay on the phone.

| Endpoint | What it does |
| --- | --- |
| `GET /health` | `{"ok": true}`. Never touches the database (uptime pings must not keep Neon awake). |
| `GET /v1/quota?device_id=` | Cards left today: `{"remaining", "limit"}`. |
| `POST /v1/generate` | `{device_id, text, mode: "text" \| "topic", max_cards ≤ 30, language?}` → `{cards: [{front, back}], remaining}` |
| `POST /v1/extract-pdf` | Multipart `device_id` + `file` (≤ 10 MB) → `{text, pages, truncated}`. Read in memory, never saved. |

Errors are always `{"error": <code>, "message": <friendly text>}`, e.g. `quota_exceeded` (429),
`ai_busy` (503, after 3 tries with backoff), `too_long` (413), `pdf_no_text` (422).

## Run it locally (Windows)

```powershell
cd server
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
copy .env.example .env          # then put your Gemini key in .env (or set LLM_PROVIDER=fake)
.venv\Scripts\alembic upgrade head
.venv\Scripts\uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The Android emulator reaches it at `http://10.0.2.2:8000`, which is what development builds of
the app use. `LLM_PROVIDER=fake` makes predictable cards without a key; put `[fake:busy]` or
`[fake:garbage]` in the text to see the app's error messages.

## Checks

```powershell
.venv\Scripts\ruff check .
.venv\Scripts\ruff format --check .
.venv\Scripts\pytest
```

Tests use an in-memory SQLite database and never call Gemini (it's mocked).

## Database

Production uses Neon's free Postgres through its **pooled** connection string. Tables:
`devices(id, created_at)` and `ai_usage(device_id, day, cards_generated)`. The day is the UTC date.
After changing `app/models.py`, add a migration with `alembic revision -m "..."` and edit it.

## Deploy (free: Render + Neon)

Both are free and need no credit card. You do these steps; nothing here pushes code for you.

**1. Database (Neon)**
1. Go to <https://neon.tech> → **Sign up** (GitHub or email).
2. **Create project**: name `recap`, region **AWS Asia Pacific 1 (Singapore)** (same area as the
   Render service in `render.yaml`), default Postgres version.
3. On the project dashboard click **Connect**. Copy the connection string **twice**:
   - with **Connection pooling** switched **on** (host contains `-pooler`): this is the app's
     `DATABASE_URL`;
   - with it switched **off**: only for running migrations (step 2).

**2. Create the tables** (from your PC, once, and again after any new migration):
```powershell
cd server
$env:DATABASE_URL = "<the NON-pooled string from Neon>"
.venv\Scripts\alembic upgrade head
Remove-Item Env:DATABASE_URL
```

**3. Push the code to GitHub** (you run `git push`; Render deploys from GitHub).

**4. Web service (Render)**
1. Go to <https://render.com> → **Get Started** → sign up with GitHub.
2. **New** (top right) → **Blueprint** → connect your GitHub account → pick the Recap repository.
3. Render reads `render.yaml` and asks for the secret values:
   - `DATABASE_URL` → the **pooled** Neon string;
   - `GEMINI_API_KEY` → your key from <https://aistudio.google.com/apikey>.
4. **Apply**. The first build takes a few minutes. When it's live, open
   `https://<your-service>.onrender.com/health` → `{"ok":true}`. (If the name `recap-api` was taken,
   Render adds a suffix; use the URL shown on the service page.)

**5. Keep it awake** (free services sleep after 15 minutes and take ~1 minute to wake):
1. Go to <https://cron-job.org> → sign up (free).
2. **Create cronjob** → URL `https://<your-service>.onrender.com/health` → every **10 minutes** →
   **Create**. `/health` never touches the database, so Neon can still sleep. One service awake all
   month fits in Render's 750 free hours.

**6. Point the app at it**: create `app/.env` with
`EXPO_PUBLIC_API_URL=https://<your-service>.onrender.com`, restart the dev server, then build the
release APK (root README → "Release APK"). While that line is in `app/.env`, development builds
use Render too; remove it to go back to your local server (`http://10.0.2.2:8000`).
