# Study Buddy

A learning platform for visual learners who learn by doing. Combines flashcards, quizzes, tests, and visual references with AI-powered coaching.

## Features

- **Flashcard Decks**: Create, review, rate and filter module flashcards with persistent personal progress
- **Quizzes**: AI-generated quizzes to test your knowledge
- **Course Authoring**: Create structured courses with modules, content, and assessments
- **Learning Paths**: Organize courses into learning paths for guided learning
- **AI-Powered Content**: Generate editable module content, flashcards and quizzes with Anvil or an explicitly selected external provider; image generation is unavailable
- **Progress Tracking**: Track explicit study events, sessions, streaks and personal course/path completion
- **Admin Console**: User management and token administration (admin role)
- **Notifications**: Saved email/SMS preferences and truthful provider availability; delivery requires a configured transport

## User Journeys and Validation

See the [user journey and UI validation catalog](docs/user-journeys.md) for the
expected course, module, study, learning-path, sharing, statistics, and AI-model
workflows, adopted policies, and acceptance boundaries. The [26 October baseline
audit](docs/audits/2026-10-26/README.md) separates real rendered evidence, mocked
external integrations, durable tests, timings and remaining limits. The
[40-journey Playwright suite](frontend/e2e/README.md) runs in GitHub Actions against
isolated synthetic storage and reports each journey independently.

The historical [25 October walkthrough](docs/audits/2026-10-25/README.md) records outcomes,
timings, evidence, and issues for all 40 journeys. The
[AI workspace proposal](docs/ai-workspace-proposal.md) outlines one workflow for
planning, generating, and revising paths, courses, and modules.

Shared lesson HTML is sanitized, and Mermaid diagrams use strict mode. Scripts,
iframes, event handlers, inline CSS and unsafe link protocols are removed from
rendered output; standard Markdown, tables, code and protected images remain usable.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + TypeScript (Vite) |
| Backend | Python 3.11+ / FastAPI |
| Data Models | Pydantic v2 |
| Content | Markdown files |
| Persistence | JSON (local), SQLite/Supabase (production) |
| AI | Anvil Serving router (self-hosted, OpenAI-compatible) |

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 22.12+ or 24 LTS (CI tests 22 and 24)
- [uv](https://github.com/astral-sh/uv) (Python package manager)

### Backend Setup

```bash
cd backend
uv sync

# Copy and configure environment
cp .env.example .env
# Edit .env with your settings (ANVIL_ROUTER_BASE_URL, ANVIL_ROUTER_TOKEN, etc.)

# Run development server (port 8010 to match frontend proxy)
uv run uvicorn main:app --reload --port 8010
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

### Tailnet deployment and E2E

On `fakoli-mini`, the production-style test stack is exposed only to the
Tailscale tailnet. FastAPI and the Node host bind to loopback; Tailscale Serve
terminates HTTPS on port 4443. Existing Serve routes on ports 443, 8443, and
9120 are left unchanged.

```bash
# Build the frontend, start the loopback services, and configure Tailscale Serve
./scripts/start-tailnet.sh

# Run the full HTTPS E2E: register, login, Anvil health, text generation,
# course/module persistence, and structured flashcard generation
uv run --no-project python scripts/e2e-tailnet.py

# Stop the processes and remove only the :4443 Tailscale Serve route
./scripts/stop-tailnet.sh
```

Tailnet URL: `https://fakoli-mini.tail4378d.ts.net:4443/`

## Environment Variables

Create a `.env` file in the project root (or `backend/` directory):

```bash
# Required
DEBUG=true
JWT_SECRET=your-secret-key

# AI (Anvil Serving router - self-hosted, OpenAI-compatible)
ANVIL_ROUTER_BASE_URL=https://fakoli-dark.tail4378d.ts.net/v1
ANVIL_ROUTER_TOKEN=your-router-token
ANVIL_MODEL=llm.primary            # text generation route
ANVIL_VISION_MODEL=vision.general  # image/vision route

# Storage
STORAGE_BACKEND=json    # or sqlite, supabase
STORAGE_PATH=./data

# Optional: Supabase
SUPABASE_URL=...
SUPABASE_KEY=...

# Optional: Notifications
MAILGUN_API_KEY=...
MAILGUN_DOMAIN=...
```

The router credential is server-side only. Currently, users do not provide
provider API keys; the Settings page reports whether the shared Anvil connection
is healthy. Per-user model choice and external-provider keys are planned in the
[AI journeys](docs/user-journeys.md#ai-provider-and-model-choice), with Anvil as
the default.

## Project Structure

```
/study-buddy
  /docs
    architecture.md      # API specs, data models
    implementation.md    # Development guide
  /backend
    /api/routes          # FastAPI route handlers
    /models              # Pydantic models
    /services            # Business logic
    /storage             # Storage backends
    main.py              # FastAPI app
  /frontend
    /src
      /api               # API client functions
      /components        # React components
      /hooks             # Custom React hooks
      /pages             # Page components
  /content
    /courses             # Markdown course content
```

## API Overview

Base URL: `/api/v1` | **74+ total endpoints**

| Resource | Endpoints | Purpose |
|----------|-----------|---------|
| `/auth` | 6 | Registration, login, tokens |
| `/courses` | 7 | Course CRUD and discovery |
| `/courses/.../modules` | 7 | Module CRUD and reordering |
| `/paths` | 9 | Learning path management |
| `/generate` | 5 | AI content generation |
| `/admin` | 4 | User management (admin only) |
| `/auth/ai-connection` | 1 | Shared Anvil router health |
| `/decks` | 8 | Flashcard CRUD |
| `/reviews` | 3 | Spaced repetition tracking |
| `/quiz` | 3 | Quiz generation/submission |
| `/progress` | 3 | Stats and session history |
| `/ai` | 4 | Explanations, hints, examples |
| `/uploads` | 3 | Image upload and serving |

See [docs/architecture.md](docs/architecture.md) for full API specs.

## Development

### Running Tests

```bash
# Backend
cd backend
uv run pytest tests/ -v

# Frontend
cd frontend
npm run test
```

### Linting

```bash
# Backend
uv run ruff check backend/

# Frontend
npm run lint --prefix frontend
```

## License

Apache-2.0 - See [LICENSE](LICENSE) for details.

The [local Codex subscription prototype](docs/local-codex-subscription.md) is deferred after failed isolation qualification and has no executable provider path. Historical AI-06 evidence is retained; the active browser suite contains the original 40 IDs. Stored subscription selections require explicit replacement in Settings, with no fallback.
