# Bilingual app (Vietnamese / English) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every person picks Vietnamese or English in Settings; the app, emails, bell/Telegram notifications and server errors follow it.

**Architecture:** One shared module (`packages/shared/src/i18n/`) holds the language list and a `translate()` that maps a finished English server/shared text (the English in the code is only an id) to the person's language, using a table generated from the owner's spreadsheet. The web keeps one catalog per language (`en.ts` written by hand, `vi.ts` generated) and picks one at page load; switching reloads the page. The server learns the language from the account (or, before sign in, from a header the web sends) and translates at the edges: error responses, `sendMail`, the bell list, Telegram.

**Tech Stack:** Vue 3 + Pinia, Hono + zod on Cloudflare Workers, D1 (SQLite), vitest; Python 3 + openpyxl and Node + `typescript` (already installed) for the spreadsheet tooling. No new npm dependency.

**Spec:** `docs/superpowers/specs/2026-10-18-bilingual-design.md`

## Global Constraints

- Languages: exactly `vi` and `en`. Default `vi`. Anything else from a header, local storage, the spreadsheet or a request body is ignored (treated as missing), never stored.
- Accounts existing at release keep `en`; new accounts default `vi`.
- English in server/shared code stays the id; the displayed English and Vietnamese come from the generated table. An unknown text is shown unchanged.
- Placeholders (`{name}`, `{i + 1}`) must survive translation; only a capture named `{n}` is looked up again (it holds the "Question 2: " prefix); every other capture is inserted verbatim (it is user content).
- Settings: route `/settings` for every signed-in person; `/devices` redirects there. Students see only the Language card.
- English must keep working at every commit (all existing tests pass).
- No `v-html`; emails and Telegram stay plain text.

## Review Focus

1. A hostile `x-lms-lang` header or local-storage value (`"../"`, 10 KB string, `"__proto__"`) → treated as missing, default `vi`; never reaches SQL or a file. Test in Task 3 and Task 5.
2. A spreadsheet cell with code-like text (`"; process.exit()//`, backticks, `${}`) → generated `vi.ts`/`server-text.ts` still compile and contain it as a plain string. Test in Task 2.
3. A spreadsheet row whose placeholders differ from the English, or an unknown/missing key → import refuses with the row named, writes nothing. Test in Task 2.
4. Sign-in link / invite / sign-up requests for an address with and without an account take the same path before the answer (language lookup happens inside `ctx.defer`) → no timing or response difference. Test in Task 4.
5. A homework title that looks like a catalog text (`"Due soon: x"`) → shown verbatim inside a translated notification, not translated again. Test in Task 1.

---

### Task 1: Shared language list and `translate()`

**Files:**
- Create: `packages/shared/src/i18n/languages.ts`, `packages/shared/src/i18n/translate.ts`, `packages/shared/src/i18n/translate.test.ts`
- Create (placeholder until Task 2 generates it): `packages/shared/src/i18n/server-text.ts` exporting `SERVER_TEXT: readonly ServerText[] = []`
- Modify: `packages/shared/src/index.ts` (re-export)

**Interfaces:**
- Produces:
  - `LANGUAGES = ["vi", "en"] as const`, `type Language = (typeof LANGUAGES)[number]`, `DEFAULT_LANGUAGE: Language = "vi"`
  - `parseLanguage(value: unknown): Language | null` — exact match only
  - `localeOf(lang: Language): "vi-VN" | "en-GB"`
  - `interface ServerText { id: string; en: string; vi: string }`
  - `translate(text: string, lang: Language, table?: readonly ServerText[]): string` (table defaults to `SERVER_TEXT`)

- [ ] **Step 1: Write failing tests** in `translate.test.ts` with a small inline table:
  - `parseLanguage("vi") === "vi"`, `parseLanguage("VI") === null`, `parseLanguage("__proto__") === null`, `parseLanguage(5) === null`
  - exact: `{id:"Please sign in to continue.", en:"Please sign in.", vi:"Vui lòng đăng nhập."}` → `translate("Please sign in to continue.","vi") === "Vui lòng đăng nhập."`, `"en"` → `"Please sign in."`
  - unknown text → returned unchanged
  - pattern: `{id:"Question {i + 1}: please give points.", vi:"Câu hỏi {i + 1}: vui lòng nhập điểm."}` → `"Question 3: please give points."` → `"Câu hỏi 3: vui lòng nhập điểm."`
  - `{n}` recursion: table has `"Question {i + 1}: "`→`"Câu hỏi {i + 1}: "` and `"{n}please write the question."`→`"{n}vui lòng nhập câu hỏi."`; `"Question 2: please write the question."` → `"Câu hỏi 2: vui lòng nhập câu hỏi."`
  - user content not re-translated: table has `"New homework: {a.title}"`→`"Bài tập mới: {a.title}"` and `"Due soon: {a.title}"`→`"Sắp đến hạn nộp: {a.title}"`; `"New homework: Due soon: x"` → `"Bài tập mới: Due soon: x"`
  - regex characters in ids are literal: id `"Use only numbers, spaces and + ( ) - ."` matches itself exactly
  - a 5,000-character input returns in under 50 ms and unchanged when nothing matches

- [ ] **Step 2: Run** `cd packages/shared && npx vitest run src/i18n` → FAIL (module missing).

- [ ] **Step 3: Implement.** Build once per table (memoize by table reference): a `Map` for ids without `{`, and for the rest a list of `{ re, names, entry }` where `re` is the id with every literal part regex-escaped and each `{…}` replaced by `([\s\S]*?)`, anchored `^…$`. Longest literal length first, so the most specific pattern wins. Substitute captures into the target text by placeholder name; a capture named `n` goes through `translate` again (depth limit 2). Skip matching for inputs over 2,000 characters.

- [ ] **Step 4: Run** the tests → PASS; `npx tsc -p packages/shared` (or the repo `typecheck`) clean.

- [ ] **Step 5: Commit** `feat: shared language list and server text translation`

### Task 2: Spreadsheet tooling and generated catalogs

**Files:**
- Create: `scripts/i18n/messages.mjs` (Node, uses `typescript` from `apps/web/node_modules`): `dump` prints `{ key, text }[]` of `en.ts` (resolving `GLOSSARY`); `apply <rows.json>` rewrites changed English values in `en.ts` in place by AST position (comments untouched) and writes `apps/web/src/messages/vi.ts` and `packages/shared/src/i18n/server-text.ts`
- Create: `scripts/i18n/scan-server.mjs`: the server/shared text scan used for the first export (moved from the review scratch script: drops SQL, logs, paths, cookie names, route lists, SMTP), output `{ id, where[] }[]`
- Create: `scripts/i18n/export_text.py`, `scripts/i18n/import_text.py` (openpyxl): export builds the workbook exactly as the delivered one (sheets "Hướng dẫn", "Text", hidden "_map"; columns `key, màn hình, giữ chỗ (phải giữ), ghi chú, en, vi`, extra language columns allowed but only `vi` is imported now); import reads it, validates, writes a temp JSON, calls `messages.mjs apply`
- Create: `scripts/i18n/README.md` (the two commands)
- Modify: `apps/web/src/messages/en.ts`: `export type Messages = Widen<typeof en>` where `Widen` maps every string literal to `string` recursively
- Create (generated): `apps/web/src/messages/vi.ts` `export const vi: Messages = {…}`; `packages/shared/src/i18n/server-text.ts`
- Test: `scripts/i18n.test.mjs` (run by `pnpm test:scripts`), `packages/shared/src/i18n/server-text.test.ts`

**Interfaces:**
- Consumes: `ServerText` (Task 1)
- Produces: `vi: Messages`; `SERVER_TEXT` filled from the owner's file; `python3 scripts/i18n/import_text.py <file.xlsx>`; `python3 scripts/i18n/export_text.py <out.xlsx>`

- [ ] **Step 1: Write failing tests** (`scripts/i18n.test.mjs`, small fixture workbooks built in the test with openpyxl via a tiny Python helper or prepared JSON fed to `messages.mjs apply` against a temp copy of `en.ts`):
  - a vi value `` `"; process.exit()//${x}` `` ends up in the generated file as that exact string (`JSON.stringify`), and the file imports cleanly
  - a row whose `vi` drops `{name}` → import exits non-zero naming the key, no file changed
  - an unknown key, a missing key, or a duplicate key → non-zero exit, nothing written
  - an edited `en` value for a web key changes only that literal in `en.ts`; comments and other lines byte-identical
  - leading/trailing spaces of the English id are kept on `vi`/`en` (the 5 prefix rows `server.096`, `113`, `114`, `120`, `121`)
- [ ] **Step 2: Write failing** `server-text.test.ts`: every `SERVER_TEXT[i].id`, with `{x}` turned back into `${x}`, occurs in at least one file under `apps/api/src` or `packages/shared/src` (stale ids fail); ids are unique.
- [ ] **Step 3: Implement** the scripts. Generated files start with `// Generated by scripts/i18n/import_text.py from the text spreadsheet. Do not edit by hand.`
- [ ] **Step 4: Add the missing texts** to the server rows before importing: `"{s.name} handed in work"` (SQL in `notifyHandInStatement`) and `"{lesson.course_name} · now {body.date} {body.startTime}"` (`tellLessonChanged` body). Their Vietnamese is not in the owner's file: use `"{s.name} đã nộp bài"` and `"{lesson.course_name} · giờ mới {body.date} {body.startTime}"` and list both in the hand-off for the owner to check.
- [ ] **Step 5: Run** `python3 scripts/i18n/import_text.py tutorio-ui-text-vi-ux-full.xlsx` → writes `vi.ts` and `server-text.ts`; `en.ts` unchanged (no English was edited).
- [ ] **Step 6: Run** `pnpm test:scripts`, `cd packages/shared && npx vitest run`, `pnpm typecheck` → all PASS.
- [ ] **Step 7: Commit** `feat: generate the Vietnamese catalogs from the text spreadsheet` (do not commit the `.xlsx` files)

### Task 3: Language on the account and in each request

**Files:**
- Create: `apps/api/migrations/0021_user_language.sql`
- Modify: `apps/api/src/repos/users.ts` (`UserRow.language`, select it, `insertUser` takes `language`, add `setLanguageStatement(db, userId, language)` and `languageOfEmail(db, email): Promise<Language>`)
- Modify: `apps/api/src/auth/actor.ts` (`Actor.language: Language`), `apps/api/src/middleware/auth.ts` (fill it)
- Create: `apps/api/src/middleware/language.ts` (`requestLanguage` middleware after `loadActor`: `actor?.language ?? parseLanguage(header "x-lms-lang") ?? "vi"`, stored as `c.var.language`); `apps/api/src/env.ts` variable type
- Modify: `apps/api/src/auth/service.ts` (`Ctx.language`, set in `makeCtx`), sign-up (`auth/service.ts:167`) and Google first sign-up (`auth/google.ts:80`) store `ctx.language`; invite acceptance (`students/invites.ts:165`) stores `"vi"` for a new account and never changes an existing one
- Modify: `apps/api/src/google/flow.ts` (`flowSchema.language: z.enum(LANGUAGES).optional()`), the Google start route reads `?lang=` through `parseLanguage`
- Modify: `packages/shared/src/schemas.ts` (`MeResponse.user.language`, `setLanguageBody = z.object({ language: z.enum(LANGUAGES) })`), `apps/api/src/routes/auth.ts` (`GET /me` includes it; new `PUT /me/language` → `{ language }`), `apps/api/src/routes/access.ts` (`"PUT /api/me/language": "user"`)
- Modify: `apps/api/src/app.ts` `onError`: translate `message` and every `fields` value with `c.var.language`
- Test: `apps/api/test/language.test.ts`

**Interfaces:**
- Consumes: `Language`, `parseLanguage`, `translate` (Task 1); `SERVER_TEXT` (Task 2)
- Produces: `Actor.language`, `Ctx.language`, `c.var.language`, `languageOfEmail(db, email)`, `PUT /api/me/language`

- [ ] **Step 1: Migration.** `ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'vi' CHECK (language IN ('vi', 'en'));` then `UPDATE users SET language = 'en';` (accounts at release keep English).
- [ ] **Step 2: Write failing tests** in `language.test.ts`:
  - a user created before the migration's update (seed via SQL in the test DB after applying 0001–0020, then 0021) has `en`; `createTeacher()` after it gets `vi`
  - `GET /api/me` → `user.language`
  - `PUT /api/me/language {language:"en"}` → 200 `{language:"en"}`, then `/me` says `en`; `{language:"fr"}` → 400; without the client header → 403 (CSRF); signed out → 401
  - an error for a signed-in `vi` user: `POST /api/courses` with `{}` → `fields.name` is the Vietnamese text of "Please enter a name."
  - signed out, header `x-lms-lang: en` → English error; header `x-lms-lang: <10 KB junk>` or `__proto__` → Vietnamese; no header → Vietnamese
  - sign-up with header `en` → the new account is `en`; Google sign-up started with `?lang=en` → `en`; `?lang=xx` → `vi`
  - accepting an invite as an existing `en` account keeps `en`; a new account from an invite is `vi`
  - the route registry test still passes with the new route
- [ ] **Step 3: Run** `cd apps/api && npx vitest run test/language.test.ts` → FAIL.
- [ ] **Step 4: Implement** as listed under Files.
- [ ] **Step 5: Run** the new test and the whole API suite → PASS; `npx tsc -p apps/api/tsconfig.json` clean.
- [ ] **Step 6: Commit** `feat: save each person's language and answer errors in it`

### Task 4: Emails, bell and Telegram in the recipient's language

**Files:**
- Modify: `apps/api/src/auth/service.ts` `sendMail`: inside the deferred work, `const lang = await languageOfEmail(db, message.to)`, then send `{ ...message, subject: translate(subject), text: lines translated one by one }`
- Modify: `apps/api/src/notifications/service.ts`: `list` translates `title` and `body` with `actor.language`; `forwardToTelegram` gets each recipient's language with the chat (`linkedChatsOf` returns `{ chatId, language }`, join `users`)
- Modify: `apps/api/src/repos/telegram.ts` (`linkedChatsOf`), `apps/api/src/telegram/service.ts` (replies: unknown chat → `vi`; after linking → that user's language)
- Modify: `apps/api/src/invoices/service.ts` `monthName` → `"MM/YYYY"` (language-neutral; the receipt already says "Học phí tháng {month}")
- Test: `apps/api/test/language-outbound.test.ts`

**Interfaces:**
- Consumes: `languageOfEmail`, `translate`, `Actor.language`

- [ ] **Step 1: Write failing tests:**
  - sign-in link to an `en` account → dev outbox subject "Your sign in link" (English table text); to a `vi` account → Vietnamese subject and body lines; link line unchanged
  - invite to a new address → Vietnamese; invite to an address that already has an `en` account → English
  - response for sign-in-link request is identical (status, body) for an address with an account and without one (existing test pattern in `auth.test.ts`)
  - publish homework to two students, one `vi` one `en` → each one's `GET /api/notifications` shows the title in their language; a homework titled "Due soon: x" shows "Bài tập mới: Due soon: x" for the `vi` student
  - a `vi` student linked to Telegram gets the Vietnamese title (stub `fetch` to api.telegram.org, as `telegram.test.ts` does)
  - Telegram `/start` with a bad code from an unknown chat → Vietnamese reply
  - receipt notification title contains `10/2026` style month
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** the file and the full API suite → PASS.
- [ ] **Step 5: Commit** `feat: send emails and notifications in each person's language`

### Task 5: Web picks the language at load

**Files:**
- Create: `apps/web/src/features/i18n/language.ts`: `storedLanguage(): Language` (local storage key `lms.lang`, `parseLanguage`, any error → `"vi"`), `rememberLanguage(lang: Language): void` (errors ignored)
- Modify: `apps/web/src/messages/index.ts`: `export const language = storedLanguage(); export const messages: Messages = language === "en" ? en : vi;`
- Modify: `apps/web/src/api/client.ts` (header `x-lms-lang` on every request), `apps/web/src/features/forms/useForm.ts` (zod issue messages through `translate(…, language)`), `apps/web/src/features/format.ts` (`localeOf(language)` instead of `"en-GB"`), `apps/web/index.html` / `main.ts` (`document.documentElement.lang = language`)
- Modify: `apps/web/src/features/auth/session.ts` `load`: if `me.user.language !== language`, `rememberLanguage(me.user.language)` and `location.reload()` (once: only when the stored value actually changed)
- Test: `apps/web/src/features/i18n/language.test.ts`, extend `apps/web/src/api/client.test.ts`, `apps/web/src/features/forms/useForm.test.ts`

- [ ] **Step 1: Write failing tests:** stored `"en"` → `"en"`; stored `"x"`, `"__proto__"`, missing, or `localStorage` throwing → `"vi"`; the client sends `x-lms-lang`; a zod "Please enter a name." shows Vietnamese in `useForm` when language is `vi`; `vi` and `en` catalogs have identical key sets (walk both objects).
- [ ] **Step 2: Run** `cd apps/web && npx vitest run` → FAIL. **Step 3: Implement.** **Step 4: Run** tests, `npx vue-tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat: show the web in the stored language`

### Task 6: Settings page with the Language card

**Files:**
- Rename: `apps/web/src/pages/DevicesPage.vue` → `SettingsPage.vue`; route `/settings` with `meta: { requiresAuth: true }`; `{ path: "/devices", redirect: "/settings" }`
- Create: `apps/web/src/components/LanguageCard.vue` (two radio rows from `LANGUAGES`, current marked, "Save language" disabled until a different one is picked, `AppConfirm`, then a full-screen loading state "Changing the language..." while `PUT /me/language` runs, then `rememberLanguage` + `location.reload()`; on error: toast, stay)
- Create: `apps/web/src/features/i18n/useLanguageSetting.ts` (logic only: chosen, save())
- Modify: `apps/web/src/components/AppLayout.vue` (nav "Settings" for everyone, icon `settings` or existing gear), `apps/web/src/messages/en.ts` (new keys: `settings.*`, `language.*` — names of languages are shown in their own language: "Tiếng Việt", "English"), then re-run the export so the owner gets the new keys; until then add the Vietnamese for these few keys by hand in the same commit, listed in the hand-off
- SettingsPage: Language card first; devices list and Telegram card only for teachers
- Test: `apps/web/src/features/i18n/useLanguageSetting.test.ts`; web architecture tests

- [ ] **Step 1: Failing tests** for `useLanguageSetting`: save sends `{language}` once, calls reload only after success, not on error.
- [ ] **Step 2–4:** implement, `npx vitest run`, `npx vue-tsc --noEmit` → PASS.
- [ ] **Step 5: Browser check** (local server, seeded teacher + student): teacher switches vi→en with confirm and loading, lands on Settings in English; student sees only the Language card; `/devices` lands on `/settings`.
- [ ] **Step 6: Commit** `feat: Settings page with a language choice for everyone`

### Task 7: Both languages on every screen, and hand-off

**Files:**
- Create: `scripts/i18n/screens.mjs` (Playwright from the cached install, system Chrome): seeds data like the UX review, screenshots every teacher and student screen at 1280 and 390 wide in `vi` and `en`, prints sideways overflow per screen
- Modify: screens whose Vietnamese labels break layout (only CSS/markup, never shortening the owner's text without telling them)
- Modify: `docs/deploy.md` (migration 0021; existing accounts stay English)

- [ ] **Step 1: Run** the sweep → list of overflows; fix each; re-run until `overflow 0px` everywhere and the screenshots look right.
- [ ] **Step 2: Run** `python3 scripts/i18n/export_text.py ~/Downloads/tutorio-ui-text-v2.xlsx` so the owner has the new keys and the two added server texts.
- [ ] **Step 3: Full check:** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:scripts`.
- [ ] **Step 4: Commit** `fix: fit Vietnamese labels on every screen`
