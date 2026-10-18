# Bilingual app: Vietnamese and English

## Why

Most people who use Tutorio are English teachers in Vietnam. Some want the app in Vietnamese, some in English.
So each person picks their own language, instead of the whole app being one language. Today the app is English
only.

## What the owner decided

- **Two languages now: Vietnamese and English.** More can be added later as new columns in the text spreadsheet.
- **Vietnamese is the default** for every new person, and for every page shown before signing in.
- **Accounts that exist when this ships keep English**, since they used the app in English until now (one real
  teacher and her students in production). They can switch to Vietnamese in Settings. Only accounts created
  after the release start in Vietnamese.
- **Each person chooses their own language.** It is saved on their account, so it follows them to any device.
- **Invited students always start in Vietnamese** (their first page and the invite email), not in the language
  of the teacher who invited them.
- **The "Devices" page becomes "Settings" (Cài đặt).** It gets a new **Language** card at the top.
  - Teachers see: Language, then the devices list and Telegram, as today.
  - Students now also get Settings in their menu, but see **only the Language card**. They do not see devices or
    Telegram.
- **The Language card shows both choices at once** (two radio rows: "Tiếng Việt", "English", the current one
  marked "in use"), and a "Save language" button. Not a dropdown.
- **Changing it asks first**: a confirm dialog ("Change the language to English?" / what changes / Cancel /
  Change language). On confirm the app shows a full-screen "Changing the language..." loading state, saves the
  choice on the account, and reloads in the new language, staying on Settings.
- **Everything sent to a person follows that person's language**: email, in-app notifications (the bell),
  Telegram messages, and error messages from the server. Example: a teacher using English sends a receipt; a
  student using Vietnamese gets the receipt email in Vietnamese.
- **Text the teacher types is never translated** (course names, questions, notes, receipt lines).
- The Vietnamese content is given: `tutorio-ui-text-vi-ux-full.xlsx` in the repo root, 1,122 rows, every row
  has Vietnamese. Use it as is. Known fix to make while importing: 5 prefix texts lost their trailing space in
  translation (`server.096`, `113`, `114`, `120`, `121`, e.g. "Bài tập mới:"); keep the space of the English
  original, or the notification reads "Bài tập mới:Unit 1".

## Goals

1. A person who picks Vietnamese sees no English anywhere they normally go, and the other way round (except
   the teacher's own content, and the brand name "Tutorio").
2. Email, bell and Telegram messages are in the recipient's language.
3. The owner can repeat the spreadsheet cycle: export all text to Excel, edit or add a language, give the file
   back, and the change is applied by a script, not by hand.

## Non-goals

- No language switch on the public pages (welcome, sign up, sign in). They are Vietnamese, or the language last
  used in that browser (see "Calls I made").
- No translation of content people type.
- No third language yet, only the structure for it.
- Currency stays VND.

## Anti-goals (would count as failure even if it "works")

- A screen mixing the two languages.
- Longer Vietnamese labels breaking buttons, badges, tables or the phone layout. Check every screen in both
  languages, desktop and phone, as was done in the UX review.
- English becoming worse or lost. English stays complete and is still the language the code is written in.

## Where the text lives today (for the builder)

- **Web screens:** `apps/web/src/messages/en.ts`, one object, 948 strings. A web architecture test forbids text
  outside it. Screens read it once when they load (`const t = messages.courses`), so the active language is
  fixed for the life of the page; switching language reloads the page.
- **Server and shared texts:** 174 distinct English strings in 215 places, not in a catalog:
  - generic error messages: `packages/shared/src/errors.ts`
  - form validation messages: `packages/shared/src/schemas.ts` (zod). These run on the server **and** in the
    browser (forms validate before sending), so both sides need them translated.
  - feature errors thrown with `AppError(..., { message })` or `fields`, in `apps/api/src/*/service.ts`
  - email templates: `apps/api/src/email/templates.ts` and the receipt email in `apps/api/src/invoices/service.ts`
  - notifications: titles built in services and two in SQL (`apps/api/src/repos/notifications.ts`:
    `'New homework: '`, `'Due soon: '`), stored as text in the `notifications` table and forwarded to Telegram
  - Telegram bot replies: `apps/api/src/telegram/service.ts`
  - The spreadsheet's hidden `_map` sheet lists every one with its file and line.
- **Dates:** formatted with `Intl` in `en-GB` (`apps/web/src/features/format.ts`, receipt month name in
  `apps/api/src/invoices/service.ts`).

## Calls I made (not discussed with the owner; check these)

1. **Public pages** use the language last used in that browser (kept in local storage), Vietnamese if none.
   After sign in, the account's language wins; if it differs from the browser's, store it and reload once.
2. **Server texts keep their English in the code, but only as an id.** Rather than replacing 215 strings in code
   with keys, the server (and the browser, for shared validation messages) looks the finished English message up
   at the edge, in a shared table generated from the spreadsheet, and shows that table's text for the person's
   language. The table has a text for **every** language, English included, so when the owner rewrites an
   English text in the spreadsheet the import changes the table, never the source files. Texts with
   placeholders match as patterns (`Question {i + 1}: please give points.`), and a matched placeholder value
   that is itself a known text (the "Question 2: " prefix) is looked up too. An unknown text is shown as is.
   Reason: least change to working code, and the owner can edit both languages. A test must fail if a table
   entry's id no longer exists in the code (stale), and the export script must list code texts that are not in
   the table yet. The owner does edit the English column (they said they would edit the content themselves),
   for web texts too.
3. **Notifications are stored in English, as today, and shown in the reader's language** when the bell list is
   read and when a notification is forwarded to Telegram. They are made in bulk by one SQL statement for many
   people, so translating per person there would be fragile. Side effect: old notifications also switch when a
   person changes language.
4. **The request's language for server errors:** the signed-in person's language; before sign in, the language
   the web sends with each request (from local storage), Vietnamese if none.
5. **Emails:** the recipient account's language; Vietnamese when the recipient has no account yet (invites) or
   when unknown. The sign-up confirmation email uses the language the page was shown in.
   **An invite never changes a saved choice:** a person who already has an account (a student of another
   teacher, or a teacher) keeps their language when they accept an invite, and their invite email uses it.
   "Invited students start in Vietnamese" applies to new accounts.
6. **Dates and month names follow the language** (`vi-VN` / `en-GB`). The receipt document keeps its current
   Vietnamese title ("Học phí tháng {month}"); the spreadsheet already has it in both columns.
7. **`/devices` keeps working** and sends people to `/settings`, since docs and old links point there.
8. **The language list is closed** (`vi`, `en`) and stored on `users` with a database check, default `vi`.
9. **The export and import scripts live in the repo** (`scripts/`), so the spreadsheet cycle can be repeated.
10. **Checking both languages is automated early**, not left to the end: a Playwright screenshot sweep of every
    screen at desktop (1280) and phone (390) width in both languages, reporting any sideways overflow, run
    against a local server with seeded data (the same approach as the UX review). The builder looks at the
    screenshots; the owner gets them to look at too.
11. The spreadsheet missed one notification title built in SQL ("handed in work", in
    `apps/api/src/repos/notifications.ts`); add it and any other text found while building, and export again so
    the owner can translate it.

## Left to the builder

The exact API shape for saving the language, the module layout of the translation table, how `vi.ts` is
generated, the test list, and the order of work. Keep each step deployable: English must keep working at
every commit.
