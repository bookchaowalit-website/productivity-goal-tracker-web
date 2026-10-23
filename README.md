# Goal Tracker

A browser-only goal board ("mission control"): open a goal, tick and rename its milestones, watch each goal's
progress and the average over active goals, and archive, restore or delete goals. Everything stays in this
browser's localStorage; a fresh browser starts with one sample goal.

Live: https://goal-tracker.bookchaowalit.com (deployed by Vercel CLI; it can lag `main`, see `PRODUCT.md`).

## What it does not do

- No account, sync, sharing, reminders, due dates or target percentages. Each new goal starts with one
  milestone ("First waypoint"); there is no button to add more milestones yet.
- Progress is the share of done milestones, all weighted equally.

## Run

```bash
npm ci
npm run dev
```

## Checks

```bash
npm test           # Vitest: goal logic, storage store, MCP route, home page render, Sentry scrubbing
npm run lint
npm run typecheck
npm run build
```

CI (`.github/workflows/ci.yml`) runs the shared Node workflow (with a line-coverage gate) and the shared security
scan on every push and PR to `main`.

## Code map

- `lib/goals.ts`: goal types, the sample goal, `parseGoals` (validates stored data, falls back to the sample on
  corrupt storage), progress and the goal actions used by the page.
- `lib/local-store.ts`: a small localStorage store read with `useSyncExternalStore` (no setState in an effect).
  This repository owns its copy.
- `app/api/mcp/route.ts`: stateless JSON-RPC endpoint with `get_sample_goals` and `compute_progress`.
- `lib/sentry.ts` + `instrumentation*.ts`: error reporting to Sentry, errors only, personal data stripped; off when
  `NEXT_PUBLIC_SENTRY_DSN` is unset.
- `app/more-projects/page.tsx`: shared portfolio link page (copied per repository, not a package).
