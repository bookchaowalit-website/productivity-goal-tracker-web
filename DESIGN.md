# Goals — design

Since 2026-11-14 this app uses the shared App shell (`APP-SHELL.md`): Active / Archived lists in
the sidebar (pills on phones), a composer for a goal and its first step, and one card per goal
with a status pill (Not started grey, In progress amber, Done green), a progress bar, round
step checks with editable names, an "Add a step" row, Archive/Restore and Delete with undo.
The earlier "mission control" theme below is kept for history.

---

# Design direction

## Product world

Goal Tracker is mission control for a small route, not a productivity template. A launch panel, route line, waypoint cards, and archive bay turn progress into a navigable mission board.

## Visual system

- Palette: deep cobalt `#172a72`, panel blue `#203885`, mint `#b8f0c8`, launch orange `#f58b3d`, paper `#f3f0e8`, and ink `#101116`.
- Type: `Syne` for mission titles and `Roboto Mono` for coordinates, progress, and operational labels.
- Composition: command-center hero, horizontal route progress line, waypoint cards, then an optional archive bay.
- Motion: route and milestone state changes use compact transitions and respect reduced-motion preferences.

## Interaction and boundary

Users can add goals, edit waypoint text, complete milestones, archive/restore goals, delete records, and reveal archived work. Data persists in `localStorage` on this device. There is no team sharing, reminder engine, analytics, or external sync.

## Responsive behavior

The route line remains legible as a vertical progression on mobile, while mission cards and controls stack into a single action path without horizontal overflow.
