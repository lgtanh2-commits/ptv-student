# Deploy to Cloudflare

For going live, security, backups and what to do when something breaks, read [production.md](production.md).

Everything runs on Cloudflare with the free `*.workers.dev` address. No custom domain is needed.
The **Workers Free** plan is enough for a small number of users. There are no passwords to hash and no Queues.
Limits to watch on Free: 10 ms of CPU time per request and 100,000 requests a day. After the first deploy, look at the CPU time in the
Workers dashboard. Move to Workers Paid (5 USD a month) if requests come close to 10 ms or the daily limit.

## One-time setup (needs a Cloudflare account)

```bash
cd apps/api
pnpm exec wrangler login

# 1. Create the databases and copy each database_id into wrangler.jsonc
pnpm exec wrangler d1 create ptv-lms-staging
pnpm exec wrangler d1 create ptv-lms-production
# replace REPLACE_WITH_STAGING_D1_ID and REPLACE_WITH_PRODUCTION_D1_ID

# 2. Apply the database migrations
pnpm exec wrangler d1 migrations apply DB --env staging --remote

# 3. Build the web app and deploy
pnpm --filter @lms/web build
pnpm exec wrangler deploy --env staging
```

The address is printed at the end, like `https://ptv-lms-staging.<your-account>.workers.dev`.

## Settings needed before real people can sign in

| Setting                   | Where                                                                                       | Why                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`                 | `vars` in `apps/api/wrangler.jsonc` (per environment)                                       | The address put in email links. Must start with `https://`. Never read from the request.                                                                                                |
| `HMAC_KEY`                | `wrangler secret put HMAC_KEY --env <env>` (long random text)                               | Hashes emails and IP addresses in counters and logs. The app refuses to run without it.                                                                                                 |
| `SMTP_USER`, `SMTP_PASS`  | `wrangler secret put SMTP_USER --env <env>` and `wrangler secret put SMTP_PASS --env <env>` | The account that sends email, and its password. For Gmail: the address and an "App password" (needs 2-step verification, myaccount.google.com/apppasswords). See "Sending email" below. |
| `GOOGLE_CLIENT_ID`        | `vars` in `apps/api/wrangler.jsonc` (per environment)                                       | Turns on "Continue with Google". Without it (and the secret) the Google buttons are hidden and email links are the only way in. See "Sign in with Google" below.                        |
| `GOOGLE_CLIENT_SECRET`    | `wrangler secret put GOOGLE_CLIENT_SECRET --env <env>`                                      | Lets the server ask Google who signed in.                                                                                                                                               |
| `TURNSTILE_SECRET`        | `wrangler secret put TURNSTILE_SECRET --env <env>`                                          | Bot check on the server. The app refuses to run without it in staging and production.                                                                                                   |
| `VITE_TURNSTILE_SITE_KEY` | Set when building the web app (`VITE_TURNSTILE_SITE_KEY=... pnpm --filter @lms/web build`)  | Shows the bot check on the forms. Create a Turnstile widget in the Cloudflare dashboard and allow the `workers.dev` address.                                                            |

Telegram (below) is optional: only the feedback message to the owner uses it now.

## Sign in with Google

Students and teachers can sign in with one click, so nobody has to wait for an email each time. It is free.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project (any name).
2. "APIs & Services", "OAuth consent screen": user type **External**. Fill the app name and your email. Scopes: only `openid`, `email` and `profile` (these need no Google review). Press **Publish app**, otherwise only listed test users can sign in.
3. "Credentials", "Create credentials", "OAuth client ID", type **Web application**. Under "Authorized redirect URIs" add **exactly** `https://<your address>/api/auth/google/callback` (one for staging, one for production). Nothing else.
4. Put the client id in `GOOGLE_CLIENT_ID` (`vars` of that environment in `wrangler.jsonc`) and the secret with `wrangler secret put GOOGLE_CLIENT_SECRET --env <env>`.

Who can get in does not change: a teacher creates their own account, and a student gets in **only with the exact email a teacher added and invited**. Locally, `GOOGLE_MODE=dev` (already set in `wrangler.jsonc`) shows a test page instead of Google; it is ignored on staging and production.
Not yet tried on a real `workers.dev` address: check that Google accepts it on the consent screen.

On staging and production email goes through SMTP (see "Sending email" below). The dev outbox page is **not** available there
(it could sign people in), `EMAIL_MODE=dev` is refused in production, and the description of the API is hidden in production.
Only on your own computer, `EMAIL_MODE=dev` writes emails to a table you can read with `GET /api/dev/outbox`.

Without `TURNSTILE_SECRET` the forms for sign in and sign up by an email link are hidden (only Google is offered), because they cannot work without the bot check.

Also add a Cloudflare **rate limiting rule** for `/api/*` (for example 120 requests per minute per IP). The app limits
sensitive actions itself; this rule covers the rest.

## Automatic deploy from GitHub

1. In GitHub: Settings, Environments, create `staging` and `production`. Add **required reviewers** to `production`.
2. Add the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to each environment. Create the token with only the permissions it needs (Workers Scripts: Edit, D1: Edit).
3. Add the repository variable `DEPLOY_ENABLED` = `true`.

Pushes to `develop` deploy to staging. Production is a manual run of the workflow.

## Telegram notifications (optional)

Since 2026-10-24 (owner decision) Telegram is **only used to tell the owner about new feedback** (see "Telegram
message to you" below). Notifications that ring the bell (a student handing in work, work due soon...) are no longer
sent to Telegram for anyone; they go to the bell and to browser push. There is no Telegram card in the app any more.
The linking routes, the webhook and the existing links are kept in the code and the database so forwarding can come
back, but nothing is sent to a linked chat. Setting up a bot is needed only for the feedback message to the owner;
the webhook steps below matter only if you want linking to work.

A bot can only have **one** webhook address. Using the same bot for two environments (as staging and production
do now) means only the one last set with `setWebhook` actually receives updates; the other environment's card
still shows but linking silently does nothing. For two environments that both need to work at the same time,
make a second bot with @BotFather instead (free, one more `/newbot`) and give it its own settings.

1. Message [@BotFather](https://t.me/BotFather) on Telegram, `/newbot`, and follow the steps. It gives a token and
   an `@username`.
2. Set the settings: `wrangler secret put TELEGRAM_BOT_TOKEN --env <env>` (the token from BotFather),
   `TELEGRAM_BOT_USERNAME` as a plain `vars` entry in `wrangler.jsonc` (the `@username`, without the `@`), and
   `wrangler secret put TELEGRAM_WEBHOOK_SECRET --env <env>` (any long random text you make up yourself — it is
   never sent to Telegram, only checked against what Telegram sends back).
3. Tell Telegram where to send messages a person sends the bot (run once per environment, after the settings above
   are set and the app is deployed):
   ```bash
   curl "https://api.telegram.org/bot<the bot token>/setWebhook" \
     -d "url=<APP_URL>/api/telegram/webhook" \
     -d "secret_token=<the webhook secret>"
   ```
4. Linking has no button in the app now (the card was removed on 2026-10-24); the routes still work, but a linked chat gets nothing.

Local development needs the same three settings in `apps/api/.dev.vars` (already gitignored) to try the feature;
without them it is simply off, same as in production.

## Push notifications (optional)

With push, a browser that a person allowed can show the app's notifications even when the app is closed. Without
the two keys below, push is off and the app hides the feature.

1. Make a key pair (once, and use a different pair for each environment): `node scripts/vapid-keys.mjs`. It prints
   `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.
2. Put the private key in as a secret: `wrangler secret put VAPID_PRIVATE_KEY --env <env>`.
3. Put the public key into `vars` of that environment in `wrangler.jsonc` as `VAPID_PUBLIC_KEY` (it is not a secret;
   browsers receive it).
4. Apply migration `0023_push.sql` (it only adds tables) together with the deploy.

Changing (rotating) the pair later makes every saved subscription fail: no browser gets a push until its person
turns notifications on again in Settings (the browser then subscribes with the new key). Rotate only when the private
key may have leaked, and tell people to turn notifications on again.

Push needs the second schedule, `* * * * *` in `triggers.crons`, which sends what waits over the send limit
(`scripts/preflight-production.mjs` refuses production without both `0 * * * *` and `* * * * *`). The Free plan allows
5 cron triggers for the whole account; staging and production now use 4 (two each), so there is room for one more.

## Language (Vietnamese and English)

Migration `0021_user_language.sql` adds `users.language` (only `vi` or `en`, default `vi`) and sets every account that exists when it runs to `en`. So existing accounts stay English, new accounts start Vietnamese, and anyone can change it in Settings. The `/devices` link now goes to `/settings`.

Apply the migration and deploy the new code together, as the production workflow does (migrations, then deploy, in one run):

- If the migration runs long before the code, accounts created in that gap by the old code get `vi`.
- If the code runs before the migration, every query that reads `language` fails.

## Feedback

People send feedback from the "Feedback" menu item. Each one is saved with status `new` and is not public. Only items you accept (with a public title) appear on the board.

**Telegram message to you (optional).** Set the chat that receives each new feedback. It uses the same bot as the (kept, unused) Telegram linking (`TELEGRAM_BOT_TOKEN`); without the chat id nothing is sent, and feedback is still saved.

```sh
wrangler secret put FEEDBACK_TELEGRAM_CHAT_ID --env <env>
```

To find your chat id: send any message to the bot, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and read `message.chat.id`. A bot such as @userinfobot also shows it. Never put the token or the id in the repository.

**Managing feedback.** Run these in production with `wrangler d1 execute DB --env production --remote --command "..."`. Replace `<id>` with the id shown in the Telegram message (or in the list). Titles are shown to every signed-in person, so never copy private details into them.

Writing a title inside the command: the title sits between single quotes, so write a `'` inside it twice (`Can''t open the schedule`). The whole command sits between double quotes for the shell, so do not put `"`, `$`, `!` or a backtick in a title (in an interactive bash or zsh, `!` starts history expansion).

List new feedback:

```sh
wrangler d1 execute DB --env production --remote --command "SELECT id, kind, role, created_at, page, message FROM feedback WHERE status = 'new' ORDER BY created_at"
```

Accept. Accepting is what makes an item public: it then shows on the board under "To do" with its title. `public_title_en` is optional and is shown to people reading in English (others see `public_title`); replace `NULL` with a title in quotes, or keep `NULL`:

```sh
wrangler d1 execute DB --env production --remote --command "UPDATE feedback SET status = 'todo', public_title = 'Your title in Vietnamese', public_title_en = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = '<id>'"
```

Move to "In progress", then "Done":

```sh
wrangler d1 execute DB --env production --remote --command "UPDATE feedback SET status = 'in_progress', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = '<id>'"
wrangler d1 execute DB --env production --remote --command "UPDATE feedback SET status = 'done', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = '<id>'"
```

Reject (never shown on the board):

```sh
wrangler d1 execute DB --env production --remote --command "UPDATE feedback SET status = 'rejected', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = '<id>'"
```

Delete one:

```sh
wrangler d1 execute DB --env production --remote --command "DELETE FROM feedback WHERE id = '<id>'"
```

## Rules

- Database changes are **backward compatible** (add first, remove later), so rolling the Worker back never meets a schema it cannot read.
- Roll back a bad Worker with `wrangler rollback --env production`.
- Secrets are set with `wrangler secret put NAME --env <env>`. Never put them in the repository.
- Data can be restored from D1 Time Travel (30 days): `wrangler d1 time-travel restore`.

## Sending email

`EMAIL_MODE=smtp` sends mail through an SMTP server over a Worker TCP connection (port 465, TLS from the first byte; port 25 is blocked by Cloudflare). `EMAIL_MODE=dev` only stores mail in the outbox table and must not be used with real people.

- `vars` (in `wrangler.jsonc`): `SMTP_HOST` (for Gmail `smtp.gmail.com`), `SMTP_PORT` (`465`), `SMTP_FROM_NAME` (name shown next to the address), and `SMTP_FROM` only if the "from" address differs from the account.
- Secrets: `SMTP_USER` and `SMTP_PASS` (see the table above). Never put them in a file or in a chat.
- Gmail sends about 500 mails a day and always shows the signed in address as the sender. With your own domain, a service such as Resend gives better delivery: only the adapter in `apps/api/src/email/` changes.
- A mail that cannot be sent is logged as `deferred work failed` with the step and the server's code (for example `smtp sign in failed (535)` means a wrong user or password). The text of the mail and the password are never logged.
