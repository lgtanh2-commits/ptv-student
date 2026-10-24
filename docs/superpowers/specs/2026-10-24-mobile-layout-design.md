# Mobile layout: buttons, text, tables and tiles

## Why

On phones many screens look unfinished: buttons are stranded on the left or wrap into ragged rows, badges drop onto
their own line, amounts and dates break away from their units, tables scroll sideways and hide the important columns,
stat tiles have uneven heights. The owner's rule: on mobile a button is either **full width** or aligned to the
**right edge**, and nothing wraps onto new lines in a messy way.

Two audits of every screen at 390×844 in Vietnamese and English (screenshots from `scripts/i18n/screens.mjs`) list the
findings with source locations and proposed fixes. They are the detailed requirements for the work:

- `docs/superpowers/specs/mobile-audit/2026-10-24-buttons.md` — rules R1–R9, findings, shared changes S1–S10, one-offs.
- `docs/superpowers/specs/mobile-audit/2026-10-24-text-tables.md` — text/table/tile rules, findings, shared changes
  S11–S22 (with the overlaps with S1–S10 marked), one-offs.

## What the owner decided

- **The button rules R1–R9 of the first audit, as written.** In particular: page header actions on mobile sit on their
  own row under the title, at most 2 buttons, rarer actions in a "⋯" menu; dialogs open as a bottom sheet on mobile with
  stacked full-width buttons, primary on top; form submit rows: primary full width on top, cancel full width under it.
- **Also check banners, text, tables, tiles, badges**: everything balanced, no messy line breaks (second audit).
- **Tables on mobile become stacked rows** (one card per row, every column visible), a table from `sm` up.
- **Stat tiles on mobile stay tiles** in a compact grid with equal heights and labels of at most 2 lines; money totals
  of invoices become one summary card of label/amount rows.
- **Shorter status labels** (both languages), approved:

  | Where | vi now → new | en now → new |
  |---|---|---|
  | invites.stateSent | Đang chờ phản hồi → **Chờ phản hồi** | Waiting (unchanged) |
  | courses.statusActive | Đang hoạt động → **Đang mở** | Open (unchanged) |
  | homework.statusPublished | Đang hoạt động → **Đang mở** | Open (unchanged) |
  | assignment stateSubmitted (badge) | Chờ chấm điểm → **Chờ chấm** | Waiting for your score → **To score** |
  | assignment stateGraded (badge) | Đã chấm điểm, chưa trả bài → **Chưa trả bài** | Scored, not returned → **Not returned** |
  | assignment stateAgain (badge) | Được yêu cầu làm lại → **Cần làm lại** | Asked to do again → **To redo** |
  | queue.open ("Bài cần chấm" list) | badge **removed**; the row shows the hand-in time instead; "Muộn"/"Late" stays | (removed) |

  Longer sentences on detail pages (for example "Đang chờ bạn chấm điểm.") stay as they are.

## Goals

1. Every button on a phone is full width or right-aligned, per R1–R9, with touch targets of at least 44px.
2. No value is split from its unit, no badge drops onto its own line at the left, no single orphan word in headings.
3. No table needs a sideways swipe on a phone to see a column or an action.
4. The rules live in shared `ui/` components (and `features/format.ts` for values), so new screens get them for free.

## Non-goals

- No change to colours, fonts, radii or button variants (visual identity stays).
- Desktop layout stays as it is, except where a shared component change is neutral there.
- No new features; only layout, sizing and the approved label copy.

## Constraints

- `apps/web/src/architecture.test.ts` rules hold (features/ never import ui/; only design tokens for colours; every App*
  component imported; in a page header the main button is last). Update the rule text if R1 changes how it is checked,
  never weaken it.
- Both languages: every check is done on `vi` and `en` screenshots.
- Messages keep en/vi parity (`pnpm test:scripts`).

## Done when

The screenshot sweep (`node scripts/i18n/screens.mjs <dir>`) shows 0px sideways overflow and every High and Medium
finding of both audits fixed (or explicitly left with a reason), checked against the new mobile screenshots in both
languages; all tests, typecheck, lint and build pass.
