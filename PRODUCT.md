# Goal Tracker — Product truth

> Inferred from the code and copy (no user interview). Checked against the portfolio card claims review
> (`portfolio-site-web/docs/audits/CARD-CLAIMS-REVIEW-2026-10.md`, row `goal-tracker`, evidence Prototype) on 2026-10-23.

## What it is

A client-only goal board styled as "mission control". Goals and their milestones live in this browser's
localStorage (key `goal-tracker-v2`).

## Who it is for

A portfolio visitor, or one person in one browser, who wants to see goals broken into checkable milestones.

## What works today

1. Open a goal by name (blank names are refused with a notice). It starts with one milestone, "First waypoint".
2. Tick a milestone to mark it done, and rename any milestone in place.
3. Each goal shows its progress (share of done milestones, rounded); the readout shows the average over active goals.
4. Archive, restore (via "Show archived") and delete goals.
5. Changes persist across reloads in this browser. Corrupt or foreign data in the storage key no longer crashes
   the page: it falls back to the sample goal and drops malformed entries.
6. `/api/mcp` answers JSON-RPC with `get_sample_goals` and `compute_progress` (scores goals the caller sends). The
   server cannot see a visitor's goals, which stay in the browser.
7. Front-end and server errors go to Sentry (errors only, personal data stripped) when `NEXT_PUBLIC_SENTRY_DSN` is set.

## What does not work (and must not be claimed)

- No adding or removing milestones beyond the first one, no due dates, target percentages or reminders.
- No account, sync, sharing or export. Clearing site data removes everything.
- No product analytics beyond Vercel Analytics.

## Live URL and deploy state

- Live: https://goal-tracker.bookchaowalit.com (HTTP 200 on 2026-10-23).
- The Vercel project `bookchaowalit-goal-tracker-frontend` is deployed only by CLI. The last production deploy is
  2026-10-08 08:52 +07 (CLI, no Git metadata), from before the CVE patch: the Next 16.4.2 patch (commit 99d7c0f) is
  probably not live yet. The CVE patch deploy did not run because the Vercel free-plan daily deployment limit was
  reached on 2026-10-23; the coordinator deploys the latest green `main` later.
- Its Git link names the old repository (`bookchaowalit/bookchaowalit-goal-tracker-frontend`), so a push to `main`
  does not deploy: the live site lags `main` (no Sentry, old template MCP route) until the owner reconnects Vercel
  Git to this repository (owner action D9).
- `NEXT_PUBLIC_SENTRY_DSN` is set on the Vercel project (Sentry project `productivity-goal-tracker-web`, org
  `personal-yu0`).

## Boundaries

- Browser-only apart from the stateless `/api/mcp` route.
