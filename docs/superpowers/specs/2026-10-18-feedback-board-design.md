# Feedback board

## Why

Tutorio is live with real teachers and students. The owner wants them to say, while using the app, where something
is not convenient yet or which feature they would like, so the owner can decide what to improve next. People should
also see that their feedback goes somewhere: a public board shows what the owner accepted, what is being built and
what is done.

## What the owner decided

- **A "Feedback" menu item** (Vietnamese "Góp ý") for every signed-in person, teachers and students. In the menu it
  sits between "Fee receipts" (Học phí) and "Settings" (Cài đặt).
- **The page** has a short intro, a "Send feedback" button (top right, the page's main button), and a **kanban board
  like Jira** with three columns:
  - **To do** (Sẽ làm): feedback the owner accepted.
  - **In progress** (Đang làm): accepted and being built.
  - **Done** (Đã xong): finished.
- **The button opens a form in a dialog.** After sending, the dialog closes and a toast says the feedback was sent to
  Tutorio ("Góp ý đã được gửi đến Tutorio"). Nothing else: the person does not see a list of their own feedback.
- **The board is a public roadmap**: everyone signed in, in every class, sees the same accepted items.
- **New feedback reaches the owner on Telegram.**
- **The owner changes the status with SQL** (no admin screen). Only accepted items appear on the board.
- **Contrast must be checked carefully**: every text on the page, dialog and toast meets WCAG AA (at least 4.5:1;
  3:1 only for large text) in both the light and the dark theme, measured on real screenshots, not guessed.
- Layout approved from the mockup: cards show the public title, the kind, "teacher" or "student", and the date.

## Goals

1. Sending feedback takes seconds from any screen (open menu, press the button, type, send).
2. The owner gets every piece of feedback on Telegram with enough context to understand it without asking back.
3. Nothing personal leaks through the public board.

## Non-goals

- No admin screen, no replies to the sender, no "my feedback" list, no votes or comments on cards.
- No feedback from people who are not signed in.
- No file or screenshot upload (the product has no uploads at all).

## Anti-goals

- A card showing who sent it, or the sender's own words (they can hold a student's name, a phone number or a
  complaint about someone).
- Anyone able to flood the owner's Telegram.
- Text on the board that fails contrast, or a board unusable on a phone.

## Calls I made (check these)

1. **Statuses:** `new` (just sent, not on the board), `todo`, `in_progress`, `done`, `rejected` (never shown). The
   board shows only `todo`, `in_progress` and `done`.
2. **A separate public title.** The sender's text is never shown on the board. The owner writes a short public title
   when accepting (`UPDATE feedback SET status = 'todo', public_title = '…' WHERE id = '…'`). An accepted item with
   no public title is not shown. The title is shown to everyone as the owner wrote it (it is not translated).
3. **Cards show no name**, only the kind, the sender's role (teacher/student) and the date it was sent.
4. **Kinds:** "Not convenient" (Chưa tiện), "Bug" (Lỗi), "New feature" (Tính năng mới). The form's message is
   required, 5 to 2,000 characters.
5. **Context saved with each item, filled in automatically:** sender (user id; name, email and role are looked up
   for the Telegram message), the class they belong to, the page path they were on before opening Feedback, the app
   language, and the browser/device string (shortened).
6. **Telegram:** a new optional setting `FEEDBACK_TELEGRAM_CHAT_ID` (the owner's chat), sent with the existing bot
   (`TELEGRAM_BOT_TOKEN`). Plain text, sent after the answer (best effort, like other notifications). Without the
   setting, feedback is still saved. The message includes the id and the SQL to accept it, so the owner can copy it.
   Feedback is always saved first, so a Telegram failure loses nothing.
7. **Rate limit:** at most 5 pieces of feedback per person per hour (the existing limiter). Over the limit: the
   usual "Too many tries" error, nothing saved or sent.
8. **On a phone the three columns stack** (To do, then In progress, then Done), each with its count; on wider
   screens they sit side by side. Each column has an empty state.
9. **Order:** newest first inside each column. The board shows at most 50 cards per column.
10. **All new interface text in English and Vietnamese.** The Vietnamese is added by hand in `vi.ts` (as for earlier
    additions) and listed for the owner to check; a fresh spreadsheet export is made at the end.
11. **The owner's SQL commands** (accept, move, finish, reject, delete, list new feedback) are written down in
    `docs/deploy.md`, next to the other production commands.
12. **The board is one global list, on purpose** (the owner asked for a public roadmap across all classes). Unlike
    almost everything else in the app, the board query is not limited to the reader's class. The sender's class is
    saved only as context for the owner and never shown or used for filtering. Tests must prove the board returns
    only public fields (id, public title, kind, role, date, status) and never the message, sender or class.
13. **Title language:** an optional `public_title_en`. English readers see it when set, otherwise `public_title`;
    Vietnamese readers always see `public_title`.
14. **The role on a card** is "teacher" if the sender had a teacher membership when sending, otherwise "student";
    it is saved with the feedback, so it does not change later.
15. **Keeping feedback:** all rows are kept (rejected ones too) until the owner deletes them with SQL; no automatic
    clean-up.
16. **Rate limit key:** per person (user id), across all classes; every accepted request counts.
17. **The page path** is sent by the web with the feedback. The server keeps it only if it is a path inside the app
    (starts with `/`, no `//`, no query string or fragment, at most 200 characters), otherwise stores nothing.
18. **The Telegram message is in Vietnamese** (the owner reads it), with the sender's text as they wrote it.

## Left to the builder

The API shape, the table layout and indexes, the migration number, component structure, and the test list. Follow
the existing patterns: route registry, CSRF, `requireAuth`, zod schemas in `packages/shared`, server texts through
the translation table, the screenshot sweep and contrast measurement used in the UX review.
