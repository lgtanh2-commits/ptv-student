# Feedback Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-in teachers and students send feedback from a "Feedback" menu page; the owner gets it on Telegram, accepts it with SQL, and everyone sees accepted items on a public three-column kanban board.

**Architecture:** One `feedback` table (migration 0022). Two API routes: `POST /api/feedback` (save, rate-limited, then Telegram to the owner after the answer) and `GET /api/feedback/board` (only public fields of accepted items, global across classes). A web page `/feedback` with the board and a dialog form, following the existing patterns (shared zod schemas, route registry, CSRF, catalogs in `en.ts`/`vi.ts`).

**Tech Stack:** Hono + zod on Cloudflare Workers, D1, Vue 3 + Pinia + daisyUI, vitest, Playwright (dev tooling) for screenshots and contrast.

**Spec:** `docs/superpowers/specs/2026-10-18-feedback-board-design.md`

## Global Constraints

- Statuses exactly `new`, `todo`, `in_progress`, `done`, `rejected`; the board shows only `todo`, `in_progress`, `done`, and only items whose `public_title` is not empty.
- Kinds exactly `inconvenient`, `bug`, `feature` (labels "Not convenient"/"Chưa tiện", "Bug"/"Lỗi", "New feature"/"Tính năng mới").
- Message required, 5 to 2,000 characters (after trimming).
- The board returns only: id, public title (English readers get `public_title_en` when set, else `public_title`), kind, role (`teacher`|`student`, saved at send time: teacher if the sender had any teacher membership), created date, status. Never the message, the sender, the class, the page, the language or the device.
- Board: newest first inside each column, at most 50 cards per column, one global list (not limited to the reader's class).
- Rate limit: 5 per person (user id) per hour, existing `hit()` limiter; over the limit → `RATE_LIMITED`, nothing saved, nothing sent.
- Page path kept only if it starts with `/`, does not start with `//`, has no `?` or `#`, and is at most 200 characters; otherwise stored as null.
- Telegram to the owner: optional setting `FEEDBACK_TELEGRAM_CHAT_ID`, existing bot `TELEGRAM_BOT_TOKEN`, plain text, in Vietnamese, sent inside `ctx.defer` after the row is saved; includes the id and the SQL to accept it.
- Menu item "Feedback"/"Góp ý" between "Fee receipts"/"Học phí" and "Settings"/"Cài đặt", for every signed-in person. "Send feedback" is the page's main button (last, far right). After sending: dialog closes, toast "Your feedback was sent to Tutorio." / "Góp ý đã được gửi đến Tutorio.".
- Phone: columns stack (To do, In progress, Done) with counts; wider: side by side; each column has an empty state.
- Every text on the page, dialog and toast meets WCAG AA (≥4.5:1, or ≥3:1 for large text) in light and dark themes, measured.
- All new interface text in `en.ts` and `vi.ts` (Vietnamese by hand, listed for the owner); new server texts (zod messages) go into the translation table through the spreadsheet pipeline.
- No new npm dependency; no `v-html`.

## Review Focus

1. The board must never expose the sender's words or identity, even for a row the owner accepted without a title (test in Task 1).
2. A hostile page path (`//evil.com`, `/x?token=abc`, `javascript:alert(1)`, 10 KB string) → stored as null (test in Task 1).
3. Feedback text with `<script>`, Markdown, or Telegram-looking commands → saved verbatim, sent to Telegram as plain text, never rendered as HTML anywhere (test in Task 2).
4. A sixth feedback in an hour → 429 `RATE_LIMITED`, no row, no Telegram call (test in Task 1/2).
5. An English reader and a Vietnamese reader of the same accepted item with and without `public_title_en` see the right title (test in Task 1).

---

### Task 1: Store feedback and serve the public board

**Files:**
- Create: `apps/api/migrations/0022_feedback.sql`, `apps/api/src/repos/feedback.ts`, `apps/api/src/feedback/service.ts`, `apps/api/src/routes/feedback.ts`, `apps/api/test/feedback.test.ts`
- Modify: `packages/shared/src/schemas.ts` (schemas + types), `apps/api/src/app.ts` (mount), `apps/api/src/routes/access.ts` (`"POST /api/feedback": "user"`, `"GET /api/feedback/board": "user"`)

**Interfaces:**
- Produces (shared): `FEEDBACK_KINDS = ["inconvenient","bug","feature"] as const`, `type FeedbackKind`; `feedbackBody = z.object({ kind: z.enum(FEEDBACK_KINDS), message: z.string().trim().min(5, …).max(2000, …), page: z.string().max(2000).optional() })`; `interface FeedbackCard { id: string; title: string; kind: FeedbackKind; role: "teacher"|"student"; createdAt: string }`; `interface FeedbackBoard { todo: FeedbackCard[]; inProgress: FeedbackCard[]; done: FeedbackCard[] }`.
- Produces (API): `submitFeedback(ctx: Ctx, actor: Actor, body: FeedbackBody): Promise<{ id: string }>` and `feedbackBoard(ctx: Ctx, actor: Actor): Promise<FeedbackBoard>` in `apps/api/src/feedback/service.ts`; `safePagePath(value: string | undefined): string | null` in the same file. `POST /api/feedback` → 201 `{ ok: true }`; `GET /api/feedback/board` → 200 `FeedbackBoard`.

- [ ] **Step 1: Migration** `feedback(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), tenant_id TEXT REFERENCES tenants(id), role TEXT NOT NULL CHECK (role IN ('teacher','student')), kind TEXT NOT NULL CHECK (kind IN ('inconvenient','bug','feature')), message TEXT NOT NULL, page TEXT, language TEXT NOT NULL CHECK (language IN ('vi','en')), user_agent TEXT, status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','todo','in_progress','done','rejected')), public_title TEXT, public_title_en TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)` + index on `(status, created_at)`.
- [ ] **Step 2: Failing tests** in `feedback.test.ts`:
  - teacher sends `{kind:"bug", message:"The schedule is slow"}` → 201; the row has `status='new'`, `role='teacher'`, the teacher's tenant, `language` from the account, `user_agent` ≤ 200 chars; a student's row has `role='student'`
  - message `"abc"` → 400; 2,001 chars → 400; kind `"praise"` → 400; signed out → 401; no client header → 403
  - `safePagePath`: `"/schedule"` kept; `"//evil.com"`, `"/x?token=abc"`, `"/a#b"`, `"javascript:alert(1)"`, `"schedule"`, 201-char path, 10 KB string → null (unit test) and the stored row matches
  - 6th send within an hour by the same user → 429, still 5 rows; another user can still send
  - board with rows in every status (set via SQL in the test): only `todo`/`in_progress`/`done` with a non-empty `public_title` appear, in the right column, newest first; a `todo` row with null `public_title` is absent; `new` and `rejected` never appear
  - board JSON for each card has exactly the keys `id,title,kind,role,createdAt` (assert `Object.keys`), and the response body string does not contain the message text, the sender's name/email, or the tenant id
  - board is global: a teacher of another tenant sees the same cards
  - an `en` reader gets `public_title_en` when set and `public_title` when not; a `vi` reader always gets `public_title`
  - 51 `done` rows → 50 cards in `done`
- [ ] **Step 3: Run** `cd apps/api && npx vitest run test/feedback.test.ts` → FAIL.
- [ ] **Step 4: Implement** as listed. Rate limit key `feedback:user:{userId}`, `hit(db, key, 5, 3600)`, checked before saving. Role: `teacherMembership(actor) ? "teacher" : "student"`; tenant: the teacher membership's tenant, else the first membership's. User agent from `ctx.userAgent` (already cut to 200).
- [ ] **Step 5: Run** the file, the full API suite, `npx tsc -p tsconfig.json`, web `npx vue-tsc --noEmit` → PASS.
- [ ] **Step 6: Commit** `feat: save feedback and serve the public board`

### Task 2: Tell the owner on Telegram

**Files:**
- Create: `apps/api/src/feedback/telegram.ts` (`feedbackTelegramText(o): string`, `tellOwner(env, o): Promise<void>`)
- Modify: `apps/api/src/env.ts` (`FEEDBACK_TELEGRAM_CHAT_ID?: string` with a one-line doc comment), `apps/api/src/feedback/service.ts` (call `ctx.defer(tellOwner(...))` after the insert), `scripts/i18n/scan-server.mjs` (exclude `apps/api/src/feedback/telegram.ts`: owner-facing Vietnamese, not a translated server text) and `apps/api/test/…` stale-id glob if needed
- Test: `apps/api/test/feedback-telegram.test.ts`

**Interfaces:**
- Consumes: `submitFeedback` (Task 1), `telegramClient(env)` (`apps/api/src/telegram/client.ts`, plain text).
- Produces: `feedbackTelegramText({ id, kind, message, name, email, role, tenantName, page, language, userAgent }): string`.

- [ ] **Step 1: Failing tests:**
  - with `FEEDBACK_TELEGRAM_CHAT_ID` and `TELEGRAM_BOT_TOKEN` set (pass via `call(..., { env })`), stub `fetch` to api.telegram.org: one `sendMessage` to that chat id; body has no `parse_mode`; text contains the Vietnamese kind label, the message verbatim (a message `"<script>alert(1)</script> *bold* /start x"` appears byte-for-byte), the sender name, email, "Giáo viên"/"Học viên", the page or "-", and the line `UPDATE feedback SET status = 'todo', public_title = '...' WHERE id = '<id>';`
  - no `FEEDBACK_TELEGRAM_CHAT_ID` → no Telegram call, row still saved, 201
  - Telegram returns 500 → still 201, row saved
  - over the rate limit → no Telegram call
  - the text is cut to at most 4,000 characters (Telegram limit 4,096)
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (labels in Vietnamese: "Góp ý mới", "Loại", "Người gửi", "Vai trò", "Lớp", "Trang", "Ngôn ngữ", "Thiết bị", "Để duyệt"; the name/email lookup runs inside the deferred work). **Step 4: Run** the file + full API suite + `corepack pnpm test:scripts` → PASS.
- [ ] **Step 5: Commit** `feat: send new feedback to the owner on Telegram`

### Task 3: Server texts and the owner's SQL

**Files:**
- Modify: `packages/shared/src/i18n/server-text.ts` (regenerated, never by hand), `docs/deploy.md`

- [ ] **Step 1:** Run `node scripts/i18n/scan-server.mjs` (or the export) and list the new English server texts from Task 1's `feedbackBody` (texts already in the table, e.g. "This text is too long.", are reused and need nothing).
- [ ] **Step 2:** Export a fresh spreadsheet to a scratch path outside the repo (`python3 scripts/i18n/export_text.py …`), fill the `vi` cells of only the new rows (list them for the owner), import it (`python3 scripts/i18n/import_text.py …`). Expected: only the new server rows change; `en.ts`/`vi.ts` unchanged.
- [ ] **Step 3: Failing → passing test** in `apps/api/test/feedback.test.ts`: a `vi` user sending a 3-character message gets the Vietnamese field message.
- [ ] **Step 4:** `docs/deploy.md`, section "Feedback": setting `FEEDBACK_TELEGRAM_CHAT_ID` (how to find your chat id with the bot), and the SQL commands for production (`wrangler d1 execute DB --env production --remote --command "…"`): list new feedback; accept (`status='todo', public_title=…, public_title_en=…, updated_at=…`); move to `in_progress`; finish (`done`); reject; delete one.
- [ ] **Step 5: Run** shared, API, scripts tests → PASS. **Commit** `feat: Vietnamese feedback messages and the owner's SQL`

### Task 4: Feedback page, board and form

**Files:**
- Create: `apps/web/src/features/feedback/useFeedback.ts` (logic only), `apps/web/src/pages/FeedbackPage.vue`, `apps/web/src/components/FeedbackBoard.vue`, `apps/web/src/components/FeedbackDialog.vue`, `apps/web/src/features/feedback/useFeedback.test.ts`
- Modify: `apps/web/src/router.ts` (`/feedback`, `meta: { requiresAuth: true }`), `apps/web/src/components/AppLayout.vue` (nav item between invoices and settings, an existing icon such as `message`/chat — add to `AppIcon` only if none fits), `apps/web/src/messages/en.ts` + `vi.ts` (`nav.feedback`, `feedback.*`), a way to know the previous page path (router `from.fullPath` path part captured when entering `/feedback`)

**Interfaces:**
- Consumes: `POST /api/feedback`, `GET /api/feedback/board`, `FeedbackBoard`, `FEEDBACK_KINDS`, `feedbackBody` (shared).
- Produces: `useFeedbackBoard(): { board, loading, error, reload }`; `useSendFeedback(onSent: () => void): { form, … }` built on `useForm` with `feedbackBody`.

- [ ] **Step 1: Failing tests** (`useFeedback.test.ts`, stub `fetch`): send posts `{ kind, message, page }` once with the previous path; on success calls `onSent` and resets the form; a 400 shows the field error under the message; a 429 shows the general error and keeps the text; double submit sends once.
- [ ] **Step 2–3:** implement. Page: title, intro, "Send feedback" button last in the actions; board in a `grid` that is one column on phones and three from `md`; each column shows its name and count, cards newest first (title, kind label, role label, date via `formatDayShort`-style page-language formatter), empty state text per column; loading and error states. Dialog: existing `AppModal`, kind as `AppSegmented` (three options, default `inconvenient`), `AppTextarea` with a character hint, Cancel + "Send feedback"; on success close and `toast.success(t.sent)`.
- [ ] **Step 4: Run** `cd apps/web && npx vitest run && npx vue-tsc --noEmit` (architecture tests included) → PASS.
- [ ] **Step 5: Commit** `feat: Feedback page with a public board and a form`

### Task 5: Contrast and both-language check, hand-off

**Files:**
- Create: `scripts/i18n/contrast.mjs` (dev tooling: for a URL list, in light and dark color scheme, collects every visible text element's computed color and effective background, computes the WCAG ratio, reports any below 4.5:1 — or 3:1 when font-size ≥ 24px, or ≥ 18.66px and bold)
- Modify: `scripts/i18n/screens.mjs` (add `/feedback` and the open dialog), components/CSS from Task 4 as needed

- [ ] **Step 1:** Seed local data: a few feedback rows in every status with public titles (SQL against the local DB only).
- [ ] **Step 2: Run** the sweep (vi/en × 1280/390) and `contrast.mjs` on `/feedback` (board, open dialog, after-send toast) in light and dark (`colorScheme`); fix every failure with CSS/markup only; re-run until 0 failures and 0 sideways overflow; look at the screenshots.
- [ ] **Step 3: Export** `python3 scripts/i18n/export_text.py ~/Downloads/tutorio-ui-text-v4.xlsx`; verify byte-identical re-import into scratch paths.
- [ ] **Step 4: Full check** `corepack pnpm lint`, `corepack pnpm -r typecheck`, `corepack pnpm -r test`, `corepack pnpm test:scripts`.
- [ ] **Step 5: Commit** `fix: readable contrast on the Feedback page` (and the script)
