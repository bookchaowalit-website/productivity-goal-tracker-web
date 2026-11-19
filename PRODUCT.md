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

## Known limits

Two tabs of the same browser share one saved list. Every write builds on the latest saved data, and a write that
changes nothing is skipped, but each tab only redraws when the browser delivers the `storage` event. So:

- **Undo lasts 6 seconds** (one batch for every removal in the window; paused while focus is in the toast). After that
  a removed goal or step is gone; there is no trash (App shell design).
- **A step whose goal was deleted in another tab** stays in the Undo toast, which says the goal must come back first.
  If the goal is never restored, or the toast times out first, the step is lost.
- **A step added to a goal another tab just deleted** is not added; the draft is kept and returns with the goal. If
  the goal never returns, the draft is dropped on reload (drafts are not saved).
- **Same field edited in two tabs:** the last write wins. Leaving an emptied step field only fills in "Untitled step"
  when the saved title is still empty.
- **Undo from two tabs can change step order.** Each tab remembers neighbours and the old index at the time it removed
  a step; if both tabs removed steps of the same goal and both Undo, the second restore can land in a different place
  (e.g. A, B, C comes back as B, C, A). Nothing is lost, only the order.
- **A step that could not be added** (its goal was deleted in another tab) shows a notice on the page until it is
  dismissed or the next step is added; the draft comes back only if the goal does.
- **Progress rounds** to a whole percent, so 199 of 200 steps can show a full bar while the goal is still In progress.
- **Undo after adding a goal:** a removed goal comes back at its old index. If it was the only goal and a new goal
  was added before Undo, the restored goal lands at the top and pushes the new one down, although new goals are
  normally added on top (Codex review 2026-11-19, P3, accepted).
- **Storage full:** an Undo or an added step that the browser refuses to save changes nothing (storage and the page keep
  the latest saved data; nothing is written back over another tab), a notice says so, and the Undo or the step draft
  stays for another try (Undo within its 6 seconds). Other edits (ticks, renames, archive, new goals) still show in
  this tab when a save is refused and are lost on reload. A browser that refuses every write can never complete an
  Undo.
- **A step saved with an empty title** by an older version has a Remove button named only "Remove step".
- **Archive in one tab while the other is open:** the other tab shows the old list until its next redraw. Archive and
  Restore set the state their button names, so a stale tab never flips a goal the wrong way.

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
