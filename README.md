# IQ Study

An AI-assisted study platform. Upload a book, and IQ Study analyzes it, generates a set of
ultra high-probability exam questions tied to your curriculum, profiles how you learn best,
and drives a personalized adaptive study loop designed to make concepts stick.

The flow:

1. **Upload a book** — drop in a textbook or notes.
2. **Analyze** — map concepts to your curriculum and surface what matters.
3. **High-probability questions** — a focused set of likely exam questions.
4. **Personalized adaptive study** — a short profile tunes the method to you, then active recall builds lasting understanding.

The full user journey:

**register / login → onboarding profile → upload book → analyze + curriculum → high-probability questions → adaptive spaced-repetition study.**

Every layer works keyless: with no `OPENAI_API_KEY` the AI falls back to a deterministic
mock provider, and with no `AUTH_SECRET` sessions use a documented dev-only fallback, so
build, tests, local dev, and preview deployments all work with zero configuration.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- Tailwind CSS
- [Vitest](https://vitest.dev) for unit tests
- ESLint

## Architecture

- **`src/app`** — Next.js App Router pages (`/`, `/login`, `/onboarding`, `/upload`,
  `/books/[bookId]`, `/study/[bookId]`) and API route handlers under `src/app/api/*`
  (all server logic runs on the `nodejs` runtime and validates input with zod).
- **`src/lib/ingest`** — book parsing (PDF via `unpdf`, plain text) and deterministic
  overlapping chunking.
- **`src/lib/llm`** — pluggable `LLMProvider` abstraction with a real OpenAI provider and a
  deterministic `MockProvider` fallback (selected automatically when no key is present).
- **`src/lib/analyze`** — curriculum-aware `BookAnalysis` (summary, key concepts with source
  provenance, topic outline) and ranked `ExamQuestion` generation.
- **`src/lib/study`** — the learning layer: `learningProfile` (VARK-style onboarding scoring),
  `scheduler` (pure SM-2 spaced repetition), `session` (adaptive due-card selection + mastery),
  `conceptMap` (concept web derivation), and `prompt` (learning-style-aware copy).
- **`src/lib/store`** — persistence behind small interfaces: `books`, `users`, and `reviews`.
  All are in-memory module singletons for MVP (see the persistence caveat below).
- **`src/lib/auth`** — pure JWT sign/verify (`token`) plus cookie helpers (`session`).
- **`src/proxy.ts`** — route gating for authenticated pages.

## Getting started

Node.js 22 is used via [nvm](https://github.com/nvm-sh/nvm). In this sandbox Node is not on
`PATH` by default, so source nvm first:

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm install
cp .env.example .env.local   # then fill in values as needed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script              | Description                              |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Start the dev server                     |
| `npm run build`     | Production build                         |
| `npm run start`     | Serve the production build               |
| `npm run lint`      | Run ESLint                               |
| `npm run typecheck` | Type-check with `tsc --noEmit`           |
| `npm test`          | Run unit tests once (Vitest)             |
| `npm run test:watch`| Run unit tests in watch mode             |

## Environment variables

See [`.env.example`](./.env.example) for the full list. Copy it to `.env.local` for local dev.

| Variable         | Required | Description                                                                                  |
| ---------------- | -------- | -------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY` | No       | OpenAI API key. When empty, the app falls back to a deterministic mock AI provider.          |
| `LLM_PROVIDER`   | No       | AI provider: `openai` or `mock`. Defaults to `mock` when no `OPENAI_API_KEY` is present.     |
| `AUTH_SECRET`    | No\*     | Secret used to sign session JWTs (HS256). When unset, a documented dev-only fallback is used. |

\* `AUTH_SECRET` is optional in dev/CI so everything works keyless, but **production deployments
MUST set a long random `AUTH_SECRET`**. Without it, sessions are signed with a well-known
fallback key and are trivially forgeable.

The app is designed to build and run with **no AI provider key present** (mock fallback) and
**no `AUTH_SECRET`** (dev fallback), so CI, local dev, and preview deployments all work keyless.

## Authentication & onboarding

IQ Study ships a minimal, provider-free auth suitable for Vercel:

- **Accounts**: email + password. Passwords are hashed with [`bcryptjs`](https://github.com/dcodeIO/bcrypt.js)
  (pure JS, no native build). API: `POST /api/auth/register`, `POST /api/auth/login`,
  `POST /api/auth/logout`, `GET /api/auth/me`.
- **Sessions**: a signed HS256 JWT ([`jose`](https://github.com/panva/jose)) stored in an
  httpOnly cookie (`iq_session`), signed with `AUTH_SECRET`. No server-side session store, so
  it is serverless-friendly.
- **Gating**: a Next.js proxy (`src/proxy.ts`) redirects unauthenticated visitors to `/login`
  for protected routes (`/upload`, `/books`, `/onboarding`, `/study`).
- **Onboarding**: `/onboarding` presents a fixed 10-question learning-style questionnaire.
  `scoreProfile` (pure, unit-tested) turns answers into a normalized `LearningProfile`
  (visual / auditory / reading-writing / kinesthetic scores, pace, preferred review interval,
  and dominant style), persisted per user via `POST /api/onboarding` and read via
  `GET /api/onboarding`. After login, users without a profile are routed to onboarding.

**Persistence caveat**: the user store (like the book store) is in-memory for MVP. On Vercel's
serverless runtime each invocation may run in a fresh isolate, so accounts written by one
request are not guaranteed to be visible to another. Swap in a durable store (SQLite / Postgres
/ Redis) before relying on cross-request persistence in production.

## Adaptive study loop

The study loop turns generated questions into a personalized active-recall / spaced-repetition
engine — the "help your brain remember" and "web forming in your brain" parts of the product.

- **Scheduler (`src/lib/study/scheduler.ts`)** — a pure [SM-2](https://en.wikipedia.org/wiki/SuperMemo#Description_of_SM-2_algorithm)
  implementation. Given a card's `{ easeFactor, interval, repetitions }` and a self-graded
  recall score (0-5) it returns the updated card and next due date. A failing grade (< 3) resets
  the repetition streak and reviews the card again tomorrow; passing grades advance the interval
  (1 day → 6 days → `interval × easeFactor`), and the ease factor is floored at 1.3.
- **Session engine (`src/lib/study/session.ts`)** — builds a per-user, per-book deck (one card
  per generated question), selects only **due** cards, and **adapts ordering to the learner's
  profile**: kinesthetic / application-oriented learners see conceptual and application prompts
  first, and everyone sees their least-mastered cards earlier. A review-interval multiplier
  derived from `profile.preferredReviewInterval` shortens or lengthens scheduling. It also
  tracks per-concept and overall mastery.
- **Concept map (`src/lib/study/conceptMap.ts`)** — derives a web of related concepts from the
  analysis: two concepts are linked when they share source chunks (or co-occur in a curriculum
  topic). Nodes carry mastery so the UI can colour the web from red (weak) to green (mastered).
- **Study UI (`/study/[bookId]`)** — an active-recall flashcard loop (show question → reveal
  answer → self-grade 0-5), a progress/mastery indicator, and an SVG concept web coloured by
  mastery. Copy and prompts reflect the learner's dominant learning style.
- **API**: `GET /api/study/[bookId]/next` returns the next due card plus an adaptive prompt and
  mastery; `POST /api/study/[bookId]/grade` (`{ cardId, grade }`) applies SM-2, persists the
  deck, and returns the next card and updated mastery. Both require a session and validate with
  zod.

Review state lives in an in-memory store (`src/lib/store/reviews.ts`); the same production
persistence caveat applies.

## Deployment (Vercel)

Deploy target is [Vercel](https://vercel.com). All API handlers use the `nodejs` runtime and
hold no long-lived local state, so the app is serverless-friendly.

1. Push the repository to GitHub and **import the project** into Vercel (framework preset:
   Next.js — detected automatically).
2. In **Project → Settings → Environment Variables**, set the variables you need for each
   environment (Production / Preview / Development):
   - `AUTH_SECRET` — **required in production**. A long random string (e.g. `openssl rand -hex 32`).
   - `OPENAI_API_KEY` — optional. Omit it to run on the deterministic mock provider.
   - `LLM_PROVIDER` — optional. Set to `openai` (with a key) or leave as `mock`.
   - `OPENAI_MODEL` — optional. Defaults to `gpt-4o-mini` when using OpenAI.
3. Deploy. Vercel runs `next build` and serves the app.

**Production persistence**: the book, user, and review stores are **in-memory and dev-only**.
On Vercel each serverless invocation may run in a fresh isolate, so data written by one request
is not guaranteed to be visible to another. Before relying on cross-request persistence in
production, swap the store implementations for a hosted database (e.g. Postgres via Neon/Supabase,
or Vercel KV/Redis). The store interfaces (`BookStore`, `UserStore`, `ReviewStore`) exist so this
swap requires no changes to callers.

## MVP scope + roadmap / assumptions

**In scope (this MVP):**

- Email/password auth with signed-cookie sessions (no external auth provider).
- Book upload + parsing (PDF/plain text) with deterministic chunking.
- Curriculum-aware analysis and ranked high-probability exam questions.
- A 10-question learning-style profile and an adaptive SM-2 study loop with a concept web.
- Fully keyless operation via a mock AI provider and a dev-only auth fallback.

**Assumptions / simplifications:**

- Persistence is in-memory (per process). Fine for local dev and demos; not durable in
  production or across serverless isolates.
- Self-graded recall (0-5) drives scheduling; there is no automatic answer grading.
- The concept web uses a simple deterministic circular layout, not a force-directed graph.
- The mock provider produces deterministic, heuristic analysis/questions rather than
  LLM-quality output.

**Roadmap / future work:**

- A real hosted database (Postgres/Redis) behind the existing store interfaces.
- Streaming AI responses and richer parsers (EPUB, DOCX, images/OCR).
- Auto-graded free-text answers and confidence calibration.
- Force-directed, interactive concept-map visualization.
- Collaborative / shareable decks and cross-book concept linking.
- OAuth / passwordless sign-in and multi-device sync.
