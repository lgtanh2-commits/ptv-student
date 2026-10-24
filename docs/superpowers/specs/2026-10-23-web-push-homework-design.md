# Browser push notifications, and an overdue reminder for homework

> **Note 2026-10-24 (owner decision):** notifications are no longer sent to Telegram, for anyone. Wherever this spec
> says Telegram forwards them, shares the sending limit with push, or has a card next to the push card, that is the
> state at the time of writing: the limit now counts push only, and the Telegram card is gone. Telegram is only used
> to tell the owner about new feedback.

## Why

Students miss homework deadlines because they do not know the teacher gave them work. The bell in the app only
shows a notification while the student has the web app open; once the tab is closed nothing reaches them. Telegram
forwarding exists (2026-09-20) but only helps students who use Telegram and linked it. Email notifications were
designed once and removed on 2026-09-19 to save resources (migration `0016`).

The owner chose **browser push notifications** (Web Push) as the channel that reaches students when the app is
closed: a notification on the phone or computer screen, free, no account anywhere else.

The current reminder also stops at "due in 24 hours". Nothing happens once the deadline has passed, so the owner
wants **one more reminder after the deadline** for students who still have not handed in.

## What the owner decided

- **Push, not email.** Email notifications stay out (the owner first asked for email, then chose push instead).
- **Every notification that rings the bell is also pushed**, for teachers and students alike, the same way Telegram
  forwarding works today. Not only homework. (Proposed by us, the owner did not change it.)
- **The student turns push on themselves** with an "Enable notifications" button and the browser's "Allow". The
  browser's permission prompt is never shown by itself when a page opens.
- **iPhone needs a short guide**: on iOS, push only works after "Add to Home Screen" and opening the app from that
  icon (iOS 16.4 or newer). Android and computers only need "Allow".
- **Tapping a notification opens the right place** in the app (the notification's existing `link`, for example
  `/my/work/<id>`).
- **The notifications for one piece of homework**, only for students who have not handed in (no answer yet, a draft,
  or "please change your work"):
  1. When the teacher publishes it: "New homework: {title}" (exists, now also pushed).
  2. 24 hours before the deadline: "Due soon: {title}" (exists, now also pushed).
  3. **New: once, right after the deadline passes** (up to about an hour late, the job runs hourly). Only once per
     student and piece of work. The text depends on whether late work is allowed. The owner gave the exact words:
     - Late work allowed: **"Bài {title} đã quá hạn, hãy nhanh chóng hoàn thiện nhé."**
     - Late work not allowed: **"Bài {title} đã quá hạn và đã khoá nộp. Liên hệ với giáo viên để được mở nộp bài"**.
       This one exists so the student learns for next time, and knows the teacher can open it again.
- **Reminder 3 goes everywhere the others go**: the bell, Telegram, and push.
- **Over the sending limit, messages wait instead of being dropped.** The Free plan allows about 50 outgoing requests
  per request or cron run, and every push (one per device) and every Telegram message is one. What fits is sent at
  once; the rest waits in a list and goes out within a few minutes. The owner accepted that, in a large class, some
  students get the notification a few minutes late.
- A student with their own extension (`submission_extensions`) is "overdue" only after **their** extended time.
- Work with no deadline gets no overdue reminder. A student who handed in gets nothing more.
- **Push stops only when the session is signed out (owner decision, 2026-10-23).** A person who turned push on keeps
  getting pushes on that device even when they have not opened the app for a long time, whether or not they ticked
  "This is my own device. Keep me signed in." at sign in. Push stops only when the session is signed out (sign out,
  end this device, sign out everywhere), when it reaches its absolute end (90 days), or when the account is disabled.
  The idle rule still signs the person out of the app as before; it just no longer stops push. The owner accepts the
  trade-off: on a shared computer, a student who forgets to sign out keeps getting their notifications there. The
  Push card says nothing about staying signed in.

## Goals

1. A student who enabled push learns about new homework without the app open: within seconds in a small class, within
   a few minutes in a large one.
2. A student who has not handed in gets reminded before the deadline and once after it, never more.
3. Turning push on takes one button and one "Allow" (plus "Add to Home Screen" on iPhone).

## Non-goals

- No email notifications.
- No per-kind on/off settings. A person turns push on or off per device as a whole.
- No change to the existing "due soon" reminder (it ignores extensions today; leave that as it is).
- No reminders to the teacher about students who are overdue.
- No repeated overdue reminders (daily nagging and so on).

## Anti-goals (would count as failure even if it works)

- **Spam.** The same event pushed twice to one device, or reminders for old work flooding students on the day this
  ships.
- **A good action failing because of push.** Publishing, handing in, or scoring must never error or slow down because
  a push could not be sent (same rule as Telegram today: `ctx.defer`, `Promise.allSettled`).
- **An "Allow notifications?" prompt the moment someone opens the app.** Browsers punish this, and people refuse.
- **Breaking the free plan.** The project runs on the Cloudflare Workers Free plan on purpose ("no running cost").

## Constraints

- **Cloudflare Workers Free plan: 10 ms of CPU per request and per cron run.** Web Push needs, for every message, an
  encryption of the content (ECDH P-256 + HKDF + AES-GCM, the `aes128gcm` scheme of RFC 8291) and a signed VAPID token
  (ECDSA P-256, RFC 8292), all with WebCrypto. The hourly job may push to a whole class at once. The builder must
  measure the CPU cost per message early and pick an approach that fits (see "Left to the builder").
- **About 50 outgoing requests per request or cron run on the Free plan** (subrequests). Saving CPU does not help
  here: each device is still one request. The hourly job is one run for every tenant.
- **No Node-only libraries.** The popular `web-push` package relies on Node crypto; it must not be assumed to run in the
  Worker. A small Workers-compatible library or our own code on WebCrypto are both fine.
- **Content Security Policy** in `apps/web/public/_headers` is strict (`default-src 'self'`). The service worker and the
  manifest must be same-origin files. The browser never talks to the push services itself; the Worker does.
- **Bilingual.** Notifications are stored in English and translated per recipient with `SERVER_TEXT` and
  `NOTICE_IDS` (`apps/api/src/lib/outbound-text.ts`). The two new overdue texts need an English source and the owner's
  Vietnamese wording above, used word for word.
- **Push payloads pass through Google, Apple and Mozilla push services.** They are encrypted end to end, but keep
  them to what the bell already shows: title, body, link. Note this in `docs/production.md` ("Personal data").
- **Off until configured**, like Telegram: with no VAPID keys set, the server sends nothing and the web app hides the
  push card entirely. The private key is a secret.

## The how, as far as decided

### Turning it on (web)

- Add a **web app manifest** (name Tutorio, icons, `display: standalone`) and link it from `index.html`, so the app
  can be added to the home screen. iOS needs this for push at all.
- Add a **service worker** served from the site root, so its scope covers the whole app. It shows the notification it
  receives and, on tap, focuses an open tab or opens the notification's link.
- **Settings → Devices** (`components/DeviceSettings.vue`, next to the Telegram card) gets a **"Push notifications"
  card** with three states: off (button "Enable notifications"), on for this device (button "Turn off"), and
  "blocked in the browser" (short text on how to allow it in the browser's site settings). On an iPhone that has not
  added the app to the home screen, the card shows the short "Add to Home Screen" guide instead of the button.
- **Our call:** students also see a small, dismissible hint on their homework list ("Turn on notifications so you never
  miss homework") until they enable push or dismiss it. It links to the card; it never triggers the browser prompt
  by itself.

### Keeping subscriptions (API)

- A new table of push subscriptions: **one row per device** (a person can have several), holding the push endpoint
  and its keys, the user, and when it was made. Routes to add (subscribe) and remove (unsubscribe) the current
  device's subscription, both for the signed-in person only.
- When a push service answers that a subscription is gone (HTTP 404 or 410), remove that row.
- **Shared devices (our call).** A browser has one push address whoever is signed in, so an address belongs to **one
  person only** (unique per address). When someone else turns push on in that browser, the address moves to them.
  **Signing out removes this device's subscription**, so a student who signs out on a family or school computer stops
  getting pushes there, and the next person's homework titles never show for the previous one. A student who only
  closes the browser and forgets to sign out keeps getting pushes there until the session ends (owner decision above);
  maintenance keeps an idle session that still has a push address, and removes it (with the address) once it is signed
  out or past its end.

### Sending

- Extend the existing path in `apps/api/src/notifications/service.ts`: `tell` and `tellNow` already forward every new
  notification to Telegram. Push gets forwarded the same way, in the recipient's language (`noticeIn`), best-effort,
  after the response (`ctx.defer`) or inside the hourly job.
- **A waiting list for what does not fit.** Each run sends up to a safe budget under the subrequest cap (leave room
  for the run's own other calls); every message over the budget is stored in a new table of pending sends. A new
  **cron every minute** sends the next batch from that table, oldest first. A message that keeps failing for a
  reason other than "subscription gone" is retried a few times and then dropped and logged.
  **Our call:** Telegram messages go through the same budget and the same list, since they hit the same cap today.
- The hourly job keeps its own work (making reminders, clean up) and puts its sends through the same budget and list.

### The overdue reminder (API)

- A new notification kind, **`homework_overdue`**, made by the hourly job next to `notifyDueSoonStatement`, with a
  dedupe key per student and piece of work (`overdue:<assignment id>`) so it is made only once.
- A student gets it when, all at once: the work is published and not deleted; the course is not archived; the
  enrollment is active and the student is not archived; the work targets them (`target_mode` all, or listed in
  `assignment_targets`); they have not handed in (no submission, or `drafted`, or `revision_requested`); and their
  **effective deadline** has passed. **Our call:** the effective deadline is the **later** of `due_at` and their
  extension's `until_at`, because an extension may end before `due_at` and the hand-in check
  (`repos/mywork.ts`) lets work in while either is still ahead. The reminder must never say "closed" while handing in
  is still open.
- **Only recently passed deadlines count**, so shipping this does not push about old work: the effective deadline
  passed within the last 24 hours. (Our call; it also lets a missed hourly run catch up.)
- The text depends on `allow_late`, because after the effective deadline the hand-in check
  (`saveAnswerStatement` in `apps/api/src/repos/mywork.ts`) only lets work in when late work is allowed. Two
  table texts in `NOTICE_IDS.homework_overdue.title`. **Our call for the English:**
  - "Overdue: {title}. Please finish it soon." → "Bài {title} đã quá hạn, hãy nhanh chóng hoàn thiện nhé."
  - "Overdue and closed: {title}. Ask your teacher to open it again." → "Bài {title} đã quá hạn và đã khoá nộp. Liên hệ
    với giáo viên để được mở nộp bài"
- The link is the work itself (`/my/work/<id>`), like the other homework kinds.

### Docs

- `docs/plan.md` section 3.4: what was done and why push (and not email).
- `docs/deploy.md`: how to make the VAPID keys and set them for staging and production.
- `docs/production.md`: the push services in "Personal data", and the new kind in the review notes.

## Left to the builder

- The library or hand-written WebCrypto code for encryption and VAPID, after measuring CPU per message on the Free
  plan. If a class-sized batch does not fit in one run, options include reusing one VAPID token per push-service
  origin for the run, spreading the sending, or sending a push with no content and letting the service worker fetch
  the newest notification from the API. Pick one and write down why.
- The exact table name and columns, routes, and where the VAPID public key reaches the web app.
- The icons for the manifest (reuse the brand mark).
- How the service worker gets built and served (a plain file in `public/` is fine).
- Test layout, following the existing API tests (Workers runtime, `vitest`) and the web `features/` tests.
