# IQ Study

An AI-assisted study platform. Upload a book, and IQ Study analyzes it, generates a set of
ultra high-probability exam questions tied to your curriculum, profiles how you learn best,
and drives a personalized adaptive study loop designed to make concepts stick.

The flow:

1. **Upload a book** — drop in a textbook or notes.
2. **Analyze** — map concepts to your curriculum and surface what matters.
3. **High-probability questions** — a focused set of likely exam questions.
4. **Personalized adaptive study** — a short profile tunes the method to you, then active recall builds lasting understanding.

This repository is being built incrementally. This first milestone establishes the project
scaffold and a green baseline (lint, type check, unit tests, Tailwind, Vercel-ready build).
Later milestones add book ingestion, AI analysis and question generation, auth and onboarding,
and the adaptive study loop.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- Tailwind CSS
- [Vitest](https://vitest.dev) for unit tests
- ESLint

## Getting started

Node.js 22 is used via [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm use 22
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

## Deployment

Deploy target is [Vercel](https://vercel.com). The configuration is serverless-friendly; do not
rely on a long-lived local filesystem for production persistence. For MVP, local persistence
(SQLite / JSON) may be used in development only.
