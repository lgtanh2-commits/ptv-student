# Mobile Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every screen reads well on a 390px phone: buttons full width or right-aligned, no values split from units,
no stray badges, no sideways tables, even stat tiles.

**Architecture:** The rules move into shared `apps/web/src/ui/` components (and value formatting into
`apps/web/src/features/format.ts`); pages switch to those components. Each task implements a numbered group of the
audits' shared changes and the one-off findings they cover.

**Tech Stack:** Vue 3, Tailwind 4, daisyUI 5, vitest (node environment), Playwright screenshot sweep.

**Spec:** `docs/superpowers/specs/2026-10-24-mobile-layout-design.md` (with the two audits it points to).

## Global Constraints

- Mobile = below Tailwind `sm` (640px). Desktop behaviour stays the same unless a finding says otherwise.
- No new colours, fonts, radii or button variants; only design tokens (architecture.test.ts).
- Touch targets ≥ 44px on mobile (`min-h-11`).
- Messages: en/vi parity; the label copy table in the spec is word for word.
- Do not weaken `apps/web/src/architecture.test.ts`; extend it when a new rule can be checked.
- Visual check for every task: rebuild (`pnpm --filter @lms/web build`) and run
  `node scripts/i18n/screens.mjs <scratch-dir>` against the running local app (http://localhost:8787); look at the
  `vi-m-*` and `en-m-*` screenshots of the screens the task touches, and `*-d-*` to confirm desktop did not regress.
  The sweep must report 0 screens with sideways overflow.
- Stage files by name; never commit `.superpowers/` or screenshots.

## Review Focus

1. Long Vietnamese labels and long user content (names, emails, course titles) at 360–390px — nothing overflows or
   splits mid-value. Check in each task's screenshots.
2. Desktop regressions from shared component changes — compare `*-d-*` screenshots before/after.
3. Keyboard and screen reader behaviour of new components (the "⋯" menu, bottom-sheet dialogs, data list): focus,
   Escape, `aria-*`. Covered by tests in Tasks 2 and 4.
4. Sticky bottom bars vs the iPhone home indicator and the toast position.
5. Dark theme: new layouts use the same tokens.

---

### Task 1: Values that never break, and the approved label copy

**Covers:** S11 and findings G1, G7 and every finding fixed by S11 in `mobile-audit/2026-10-24-text-tables.md`; the
label copy table in the spec (including removing the queue "open" badge, TH1).

**Files:** `apps/web/src/features/format.ts` (+ `format.test.ts`), `apps/web/src/features/text.ts` (`fill`, +
`text.test.ts`), `apps/web/src/features/invoices/period.ts`, `apps/web/src/messages/vi.ts`, `en.ts`, the components
that build weekday chips (`TeacherDashboard.vue`, `StudentDashboard.vue`, `CourseLessons.vue`), `TeacherDashboard.vue`
queue row.

- [ ] Tests first: amounts ("250.000 VND"), dates, "2 điểm", weekday chips come back with no-break spaces where the
      value and its unit/parts must stay together, in both languages; a new `formatWeekdayShort` returns "CN"/"SUN" with no
      trailing comma; the month label is capitalised as the audit says.
- [ ] Implement; apply the copy table; remove the queue badge and show the hand-in time there.
- [ ] `pnpm --filter @lms/web test && pnpm test:scripts && pnpm typecheck`, sweep, commit.

### Task 2: Page header, card header, top bar, global text rules

**Covers:** S1 (+ new `ui/AppMenu.vue` "⋯" menu and `#meta` slot), S4, S15, S22 and their findings in both audits; the
schedule header one-off (move the week navigator out of the header).

**Files:** `ui/AppPage.vue`, new `ui/AppMenu.vue`, `ui/AppCard.vue`, `ui/AppShell.vue`, `styles/main.css`,
`architecture.test.ts`, every page whose `#actions` has more than 2 buttons or holds badges/due text (listed in the
buttons audit), `pages/SchedulePage.vue`.

- [ ] Tests: architecture test that a page header shows at most 2 buttons directly (more go in `AppMenu`) and the main
      one stays last; `AppMenu` keyboard behaviour (opens with Enter/Space, Escape closes, focus returns) if testable in
      the node environment, otherwise logic in a feature composable with a test.
- [ ] Implement R1/R3, the global heading/paragraph balance and word-break rules, `min-w-0` on title blocks, top bar
      gutter.
- [ ] Checks + sweep, commit.

### Task 3: Form action rows, empty states, touch targets, checkbox and divider

**Covers:** S2 (new `ui/AppFormActions.vue`, replacing the ~17 ad-hoc submit rows), S7, S8 + S17, S21, the "add
another" and "Gửi liên kết mới" one-offs, the homework "Thêm câu hỏi" 2-column grid.

**Files:** new `ui/AppFormActions.vue`, `ui/AppButton.vue`, `ui/AppEmpty.vue`, `ui/AppCheckbox.vue`,
`ui/AppDivider.vue`, and the pages/components listed for these findings.

- [ ] Tests: architecture test that pages no longer hand-roll submit rows where `AppFormActions` applies (pattern listed
      in the audit), or that `AppFormActions` orders primary last in the DOM; checks + sweep; commit.

### Task 4: Dialogs, toasts and sticky action bars

**Covers:** S3 (bottom sheet `AppModal`/`AppConfirm`, including the 3-button cancel-lesson dialogs), S10 (new
`ui/AppActionBar.vue` for attendance save and the student hand-in bar, with safe-area padding), S20 (toast).

**Files:** `ui/AppModal.vue`, `ui/AppConfirm.vue`, new `ui/AppActionBar.vue`, `ui/AppToast.vue`,
`pages/AttendancePage.vue`, `pages/MyWorkPage.vue`, the cancel-lesson dialogs.

- [ ] Focus/Escape behaviour of dialogs unchanged; checks + sweep (dialog screenshots: feedback dialog), commit.

### Task 5: List rows, row actions, segmented control

**Covers:** S12 (new `ui/AppListRow.vue`), S5 (new `ui/AppRowActions.vue`, icon-only `AppButton` option with
`aria-label`), S6 + S18 (`AppSegmented`), applied at every row listed in the audits (dashboards, invites, devices —
including readable device names instead of raw user-agent strings —, roster, lessons, links, homework rows, schedule,
my course, attendance).

- [ ] Tests for any parsing logic (device name from user agent) in `features/`; checks + sweep, commit.

### Task 6: Tables as stacked rows, stat tiles

**Covers:** S13 (new `ui/AppDataList.vue`: table from `sm`, stacked rows below, for the assignment students, invoices
and import tables), S14 (`AppStat` + new `ui/AppStatGroup.vue`: equal heights, nowrap values, 2-line labels, compact
grid; invoice money totals as one summary card), the invoices month navigator one-off.

- [ ] Checks + sweep (assignment, invoices, student home, teacher home, attendance, student detail), commit.

### Task 7: Gutters, tabs, alerts, remaining one-offs

**Covers:** S16 (one gutter scale), S9 (scrolling tabs), S19 (`AppAlert` `#actions` slot and safe wrapping, replacing
the push-hint and other alert one-offs), and every remaining High/Medium one-off of both audits not done in Tasks 1–6
(bell popover line clamp and height cap, course card price duplicate, date halves nowrap, grading score box, etc.).

- [ ] Checks + sweep, commit. List in the report any Low finding deliberately left, with the reason.

### Task 8: Final sweep against both audits

- [ ] Rebuild, run the sweep, and go through every High and Medium finding of both audits with the new `vi-m-*` and
      `en-m-*` screenshots; fix what is still wrong (small edits) or record why it stays. Full `pnpm test`,
      `pnpm test:scripts`, `pnpm typecheck`, `pnpm lint`, `pnpm build`. Commit.
