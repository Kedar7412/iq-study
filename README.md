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
| `AUTH_SECRET`    | No       | Secret used for signing user sessions. Use a long random string in real deployments.         |

The app is designed to build and run with **no AI provider key present** (mock fallback), so
CI, local dev, and preview deployments all work keyless.

## Deployment

Deploy target is [Vercel](https://vercel.com). The configuration is serverless-friendly; do not
rely on a long-lived local filesystem for production persistence. For MVP, local persistence
(SQLite / JSON) may be used in development only.
