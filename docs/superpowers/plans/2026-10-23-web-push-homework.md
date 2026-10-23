# Browser Push and Overdue Reminder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every notification that rings the bell also reaches the person's devices as a browser push, and students who
have not handed in get one reminder right after the deadline.

**Architecture:** Web Push (RFC 8030) with VAPID (RFC 8292) and `aes128gcm` payload encryption (RFC 8291), written on
WebCrypto inside the Worker, no new dependency. Subscriptions are tied to a sign in session, so signing out stops them.
Push and Telegram sends share one per-run limit; what does not fit goes into a queue table that a new every-minute
cron drains. The web app gets a manifest, a plain service worker, a card in Settings → Devices and a hint on the
student's home page.

**Tech Stack:** Cloudflare Workers + D1 + Hono + Zod (API), Vue 3 + Vite + daisyUI (web), vitest
(`@cloudflare/vitest-pool-workers` for the API).

**Spec:** `docs/superpowers/specs/2026-10-23-web-push-homework-design.md`

## Global Constraints

- Workers Free plan: about 50 outgoing requests per invocation; 10 ms CPU. Send at most `REQUEST_SEND_LIMIT = 20`
  messages per `tell` call and `JOB_SEND_LIMIT = 40` per cron run; the rest is queued.
- No new npm dependency in `apps/api` (no Node-only `web-push`). WebCrypto only.
- Push and Telegram must never make an action fail or slow down (`ctx.defer`, `Promise.allSettled`, catch and log).
- Off until configured: without `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, nothing is sent and the web hides push.
- The browser permission prompt is only ever shown after the person presses "Enable notifications".
- Notifications are stored in English; the recipient's language comes from `noticeIn` + `SERVER_TEXT`. Owner's
  Vietnamese, word for word:
  - `Overdue: {title}. Please finish it soon.` → `Bài {title} đã quá hạn, hãy nhanh chóng hoàn thiện nhé.`
  - `Overdue and closed: {title}. Ask your teacher to open it again.` → `Bài {title} đã quá hạn và đã khoá nộp. Liên hệ với giáo viên để được mở nộp bài`
- Push payload holds only `{ title, body, link }`, the same as the bell.
- Code style: comments in plain English sentences like the surrounding files; SQL in `repos/`, one statement per job.
- Commit after every task; do not push.

## Review Focus

1. **A push endpoint the server should never call** (`http://`, `https://169.254.169.254/`, `fcm.googleapis.com.evil.com`,
   a port) — the server fetches this URL, so subscribe must refuse anything but the known push services. Test in Task 3.
2. **A student signs out on a shared computer** — the next pushes for them must not go to that browser. Test in Task 4.
3. **A teacher publishes to a class bigger than the limit** — nobody is lost; the rest arrives after the minute cron.
   Test in Task 4.
4. **The day this ships** — work that went overdue days ago must not produce reminders. Test in Task 1.
5. **An extension that ends before the class deadline, or after it** — no "closed" message while handing in is still
   open, and no reminder before the student's own time is up. Test in Task 1.

---

### Task 1: Overdue reminder

**Files:**
- Modify: `apps/api/src/repos/notifications.ts` (add kind, add `notifyOverdueStatement`)
- Modify: `apps/api/src/notifications/jobs.ts`
- Modify: `apps/api/src/lib/outbound-text.ts` (`NOTICE_IDS.homework_overdue`)
- Modify: `packages/shared/src/i18n/server-text.ts` (two entries, next to `"Due soon: {title}"`)
- Test: `apps/api/test/notifications.test.ts` (new `describe("reminding about work that is overdue")`)

**Interfaces:**
- Produces: `Kind` gains `"homework_overdue"`.
- Produces: `notifyOverdueStatement(db: D1Database, fromIso: string, untilIso: string): D1PreparedStatement` — makes a
  notification for every student whose effective deadline is in `(fromIso, untilIso]`. Returns `NotifiedRow`s.
- Produces: `runNotificationJobs(env, now)` now collects the rows of due-soon and overdue and hands them to delivery in
  one call (Task 4 replaces `tellNow` with the budgeted delivery; in this task keep `tellNow` for each statement).

- [ ] **Step 1: Write the failing tests** in `apps/api/test/notifications.test.ts`, using the existing `setup`,
  `dueIn`-style SQL helpers and `runNotificationJobs(env)`:
  - `it("tells a student who has not handed in, once, right after the deadline")`: due_at = now − 30 min; run twice;
    Nam (no answer) has exactly one `homework_overdue` with title `Overdue: Unit 1 test. Please finish it soon.` when
    `allow_late = 1`, body `English A1`, link `/my/work/<id>`; Hoa (handed in) has none.
  - `it("says the work is closed when late work is not allowed")`: `allow_late = 0` → title
    `Overdue and closed: Unit 1 test. Ask your teacher to open it again.`
  - `it("in Vietnamese, uses the owner's words")`: Nam's language set to `vi` (SQL `UPDATE users SET language = 'vi'`),
    GET `/api/notifications` → title `Bài Unit 1 test đã quá hạn, hãy nhanh chóng hoàn thiện nhé.` and, for closed
    work, `Bài Unit 1 test đã quá hạn và đã khoá nộp. Liên hệ với giáo viên để được mở nộp bài`.
  - `it("says nothing about work that went overdue more than a day ago, or has no deadline")`: due_at = now − 25 h and
    a second work with `due_at = NULL` → no `homework_overdue`.
  - `it("waits for a student's own extension, and uses the later of the two times")`: due_at = now − 30 min with an
    extension `until_at` = now + 2 h → nothing; extension `until_at` = now − 3 h (earlier than due_at) → reminder
    comes from due_at (one reminder, not zero, not two).
  - `it("reminds a student whose work was sent back for changes, and not archived students or ones outside the target")`.

- [ ] **Step 2: Run them and see them fail**

  Run: `pnpm --filter @lms/api exec vitest run test/notifications.test.ts`
  Expected: the new tests FAIL (no `homework_overdue` rows).

- [ ] **Step 3: Implement `notifyOverdueStatement`** next to `notifyDueSoonStatement`, same joins and filters
  (course not archived, work published and not deleted, active enrollment, student not archived with an account,
  target mode, not handed in), plus `LEFT JOIN submission_extensions x ON x.assignment_id = a.id AND x.student_id = s.id`.
  Effective deadline: `max(a.due_at, coalesce(x.until_at, a.due_at))`, required `> ?2 AND <= ?3`, `a.due_at IS NOT NULL`.
  Title: `CASE WHEN a.allow_late = 1 THEN 'Overdue: ' || a.title || '. Please finish it soon.' ELSE 'Overdue and closed: ' || a.title || '. Ask your teacher to open it again.' END`.
  Body `c.name`, link `'/my/work/' || a.id`, dedupe `'overdue:' || a.id`, `ON CONFLICT DO NOTHING RETURNING ...`.
  In `jobs.ts`, add `OVERDUE_HOURS = 24` and call it with `(now − 24 h, now]`. Add the two `SERVER_TEXT` entries
  (English source = `en`, owner's Vietnamese = `vi`) and `homework_overdue: { title: [both ids], body: [] }`.

- [ ] **Step 4: Run the tests and the whole API suite**

  Run: `pnpm --filter @lms/api test && pnpm --filter @lms/shared test`
  Expected: PASS (including `language-outbound.test.ts`, which checks every kind has its table texts).

- [ ] **Step 5: Commit** — `feat: remind students once right after homework goes overdue`

---

### Task 2: Web Push crypto

**Files:**
- Create: `apps/api/src/push/crypto.ts`
- Test: `apps/api/test/push-crypto.test.ts`

**Interfaces:**
- Produces: `encryptPayload(plain: Uint8Array, p256dh: string, auth: string, opts?: { salt?: Uint8Array; serverKeys?: CryptoKeyPair }): Promise<Uint8Array>`
  — the full `aes128gcm` body (header: salt 16 B, record size 4096, key id = server public key 65 B; then one record,
  padding delimiter `0x02`). `p256dh`/`auth` are base64url, as the browser gives them.
- Produces: `vapidHeader(endpoint: string, keys: { publicKey: string; privateKey: string }, subject: string, now?: Date): Promise<string>`
  — `vapid t=<ES256 JWT>, k=<public key>`; JWT claims `aud` = endpoint origin, `exp` = now + 12 h, `sub` = subject.
  Cache the header per `aud` in a module-level `Map` until 1 h before `exp` (saves CPU across a batch).
- Produces: `b64url.encode(bytes: Uint8Array): string`, `b64url.decode(s: string): Uint8Array`.

- [ ] **Step 1: Write the failing tests**
  - `it("encrypts so the browser can decrypt it")`: the test makes a receiver P-256 key pair and a 16-byte auth secret
    with WebCrypto, calls `encryptPayload`, then decrypts with a small receiver-side helper written in the test
    (RFC 8291 section 3.4: ECDH with the key id, `PRK_key = HKDF(auth, ecdh, "WebPush: info\0" || ua_public || as_public)`,
    `CEK = HKDF(salt, IKM, "Content-Encoding: aes128gcm\0", 16)`, `NONCE = HKDF(..., "Content-Encoding: nonce\0", 12)`)
    and expects the original text back and header record size `4096`.
  - `it("gives a fresh salt and server key every time")`: two calls on the same input differ in the first 16 bytes.
  - `it("signs a VAPID token the public key verifies")`: split `t=`, verify ES256 over `header.payload` with the public
    key; payload `aud` = `https://fcm.googleapis.com`, `sub` = `https://lms.test`, `exp` within 12 h of `now`.

- [ ] **Step 2: Run them and see them fail**

  Run: `pnpm --filter @lms/api exec vitest run test/push-crypto.test.ts`
  Expected: FAIL, module not found.

- [ ] **Step 3: Implement `apps/api/src/push/crypto.ts`** with `crypto.subtle` (ECDH P-256 `deriveBits`, HKDF-SHA-256,
  AES-GCM 128, ECDSA P-256/SHA-256 — its signature is already the raw `r||s` ES256 wants). Import the VAPID private key
  as a JWK from `d` (private key) plus `x`/`y` taken from the 65-byte public key.

- [ ] **Step 4: Run the tests** — same command, expected PASS.

- [ ] **Step 5: Commit** — `feat: web push encryption and VAPID signing on WebCrypto`

---

### Task 3: Saving push subscriptions

**Files:**
- Create: `apps/api/migrations/0023_push.sql`
- Create: `apps/api/src/repos/push.ts`, `apps/api/src/push/service.ts`, `apps/api/src/routes/push.ts`
- Create: `scripts/vapid-keys.mjs` (prints a new key pair, base64url, with Node's WebCrypto)
- Modify: `apps/api/src/app.ts` (route), `apps/api/src/env.ts` (`VAPID_PUBLIC_KEY?`, `VAPID_PRIVATE_KEY?`),
  `apps/api/wrangler.test.jsonc` (a test key pair made with the script), `apps/api/wrangler.jsonc` (comment that the keys
  are set per environment, public key as a var, private key as a secret), `packages/shared/src/schemas.ts`,
  `apps/api/src/repos/maintenance.ts` + `apps/api/src/maintenance/jobs.ts`
- Modify: `docs/deploy.md` (section "Push notifications": run the script, `wrangler secret put VAPID_PRIVATE_KEY`, public
  key into `vars`)
- Test: `apps/api/test/push.test.ts`

**Interfaces:**
- Migration `0023_push.sql` (expand only):
  - `push_subscriptions (id TEXT PK, user_id TEXT NOT NULL REFERENCES users(id), session_id TEXT NOT NULL REFERENCES sessions(id), endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT NOT NULL)`, index on `user_id`.
  - `outbound_queue (id TEXT PK, channel TEXT NOT NULL CHECK (channel IN ('push','telegram')), target TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, tries INTEGER NOT NULL DEFAULT 0, next_at TEXT NOT NULL)`, index on `next_at`. (Used in Task 4.)
- Shared (`schemas.ts`, new section "push notifications"):
  `interface PushStatus { enabled: boolean; publicKey: string | null }`,
  `pushSubscribeBody = z.object({ endpoint, keys: z.object({ p256dh, auth }) })`,
  `pushEndpointBody = z.object({ endpoint })`, `interface PushCheck { subscribed: boolean }`.
- Routes (all `requireAuth`):
  - `GET /api/push/status` → `PushStatus`.
  - `POST /api/push/subscribe` (`pushSubscribeBody`) → `{ ok: true }`; upsert on `endpoint`, setting `user_id` and
    `session_id` from the actor (so the address moves to whoever subscribed last). `NOT_FOUND` when push is off.
  - `POST /api/push/check` (`pushEndpointBody`) → `PushCheck`: true only if this endpoint belongs to this user **and**
    this session.
  - `POST /api/push/unsubscribe` (`pushEndpointBody`) → `{ ok: true }`; deletes only the actor's own row.
- Produces (`repos/push.ts`): `liveSubscriptionsOf(db, userIds: string[]): Promise<PushSubscriptionRow[]>` — joins
  `sessions` with `revoked_at IS NULL AND expires_at > now`, plus `users.language`;
  `deleteSubscriptionStatement(db, id)`. `PushSubscriptionRow = { id; user_id; endpoint; p256dh; auth; language: Language }`.
- Endpoint rule (`push/service.ts`, `isPushEndpoint(url: string): boolean`): `https:`, no port, no user info, ≤ 2048
  chars, host is `fcm.googleapis.com` or `updates.push.services.mozilla.com`, or ends with `.push.apple.com` or
  `.notify.windows.com`. `p256dh` must decode to 65 bytes starting with `0x04`; `auth` to 16 bytes. Else `VALIDATION`.
- Maintenance: delete `push_subscriptions` whose session is revoked or expired, **before** the statement that deletes old
  sessions (foreign key); delete `outbound_queue` rows older than 24 h.

- [ ] **Step 1: Write the failing tests** in `apps/api/test/push.test.ts`:
  - `it("reports push as on with the public key")` → `{ enabled: true, publicKey: <test key> }`.
  - `it("saves this device, checks it, and removes it")`: subscribe → check true → unsubscribe → check false.
  - `it("refuses endpoints that are not a push service")`: each of `http://fcm.googleapis.com/x`,
    `https://169.254.169.254/x`, `https://fcm.googleapis.com.evil.com/x`, `https://fcm.googleapis.com:8443/x`,
    `https://u@fcm.googleapis.com/x`, and bad key lengths → 400; nothing stored.
  - `it("moves an address to the person who subscribed last")`: A then B subscribe the same endpoint → one row, B's;
    A's check is false.
  - `it("is not this device any more after signing out")`: subscribe, sign out, sign in again → check false.
  - `it("cannot remove someone else's subscription")`.
  - Maintenance: `it("removes subscriptions of ended sessions before the sessions themselves")` in
    `test/maintenance.test.ts`.

- [ ] **Step 2: Run them and see them fail** — `pnpm --filter @lms/api exec vitest run test/push.test.ts` → FAIL (404s).

- [ ] **Step 3: Implement** the migration, repo, service, routes, shared schemas, env fields, test vars and the key
  script, following `routes/telegram.ts` + `telegram/service.ts` for shape. Run
  `node scripts/vapid-keys.mjs` once and paste the pair into `wrangler.test.jsonc`.

- [ ] **Step 4: Run** `pnpm --filter @lms/api test && pnpm typecheck` → PASS.

- [ ] **Step 5: Commit** — `feat: save browser push subscriptions per signed in device`

---

### Task 4: Sending push and Telegram within the limit, with a queue

**Files:**
- Create: `apps/api/src/notifications/delivery.ts`, `apps/api/src/push/client.ts`
- Modify: `apps/api/src/notifications/service.ts` (replace `forwardToTelegram`), `apps/api/src/notifications/jobs.ts`,
  `apps/api/src/index.ts` (dispatch on `event.cron`), `apps/api/wrangler.jsonc` (crons `["0 * * * *", "* * * * *"]` in
  staging and production), `apps/api/src/repos/push.ts` (queue statements)
- Modify: `apps/api/test/helpers.ts` (a `pushFake` in the `fetch` stub for the allowed push hosts)
- Modify: `docs/plan.md` 3.4, `docs/production.md` ("Personal data": push services see encrypted content; review notes)
- Test: `apps/api/test/push-delivery.test.ts`; existing `telegram.test.ts` and `notifications.test.ts` keep passing

**Interfaces:**
- Consumes: `encryptPayload`, `vapidHeader` (Task 2); `liveSubscriptionsOf`, `deleteSubscriptionStatement`, the
  `outbound_queue` table (Task 3); `linkedChatsOf` (existing); `noticeIn` (existing).
- Produces (`push/client.ts`): `sendPush(env, sub: PushSubscriptionRow, content: { title; body; link }): Promise<"sent" | "gone" | "failed">`
  — POST with `TTL: 86400`, `Urgency: normal`, `Content-Encoding: aes128gcm`, `Authorization: vapid ...`; 2xx → sent,
  404/410 → gone, else or throw → failed; never logs the body; 8 s timeout.
- Produces (`delivery.ts`):
  - `REQUEST_SEND_LIMIT = 20`, `JOB_SEND_LIMIT = 40`, `MAX_TRIES = 3`.
  - `deliver(env: Env, rows: NotifiedRow[], limit: number): Promise<void>` — turns rows into messages (one per live
    push subscription and one per linked Telegram chat, each in the recipient's language), sends the first `limit`,
    queues the rest (`tries = 0`, `next_at = now`), queues failures (`tries = 1`, `next_at = now + 5 min`), deletes
    `gone` subscriptions.
  - `drainQueue(env: Env, limit = JOB_SEND_LIMIT): Promise<void>` — takes the oldest rows with `next_at <= now`, sends,
    deletes sent ones, bumps `tries`/`next_at` (+5 min × tries) on failure, drops (and logs) at `MAX_TRIES`, drops push
    rows whose subscription no longer exists.
  - Queue `content`: push → JSON `{ title, body, link }` with `target` = subscription id; Telegram → the finished text
    with `target` = chat id.
- `tell(ctx, statement)` → `ctx.defer(deliver(ctx.env, rows, REQUEST_SEND_LIMIT))`. `runNotificationJobs` → one
  `deliver(env, [...dueRows, ...overdueRows], JOB_SEND_LIMIT)`. `tellNow` is removed.
- `scheduled(event, env, ctx)`: `event.cron === "* * * * *"` → only `drainQueue`; otherwise the existing hourly jobs.

- [ ] **Step 1: Write the failing tests** in `apps/api/test/push-delivery.test.ts` (subscribe kids with fake
  `https://fcm.googleapis.com/fcm/send/<n>` endpoints and real test key pairs; use `call(..., { waitUntil })` to wait
  for deferred work):
  - `it("pushes a new homework to every subscribed device of the class, in each person's language")`: decrypt with the
    Task 2 test helper → `{ title: "Bài tập mới: Unit 1 test", body: "English A1", link: "/my/work/<id>" }` for a `vi` kid.
  - `it("sends no more than the limit at once and queues the rest, which the minute job sends")`: 25 subscribed kids →
    20 pushes now, 5 rows in `outbound_queue`; `drainQueue(env)` → 5 more pushes, queue empty.
  - `it("counts Telegram in the same limit")`: 15 pushes + 10 linked chats → 20 sent, 5 queued.
  - `it("removes a subscription the push service says is gone")`: `pushFake.status = 410` → row deleted, not queued.
  - `it("retries a failed send and gives up after three tries")`: `pushFake.status = 500` → queued; three
    `drainQueue` runs with the clock moved past `next_at` → row gone, no fourth try.
  - `it("does not push to a device whose session was signed out")`.
  - `it("never fails the action when sending fails")`: fetch throws for push → publish still answers 200.
  - `it("the hourly job sends due-soon and overdue reminders within one limit")`.

- [ ] **Step 2: Run them and see them fail** — `pnpm --filter @lms/api exec vitest run test/push-delivery.test.ts`.

- [ ] **Step 3: Implement** `push/client.ts`, `delivery.ts`, the changes to `service.ts`, `jobs.ts`, `index.ts`,
  `wrangler.jsonc`, `helpers.ts` (`pushFake: { sent: { endpoint: string; headers: Headers; body: Uint8Array }[]; status: number }`),
  and the docs.

- [ ] **Step 4: Run** `pnpm test && pnpm typecheck && pnpm lint` → PASS.

- [ ] **Step 5: Commit** — `feat: push every notification, within the send limit, with a queue for the rest`

---

### Task 5: Web app — install, service worker, Devices card, hint

**Files:**
- Create: `apps/web/public/manifest.webmanifest` (`name`/`short_name` "Tutorio", `start_url: "/"`, `scope: "/"`,
  `display: "standalone"`, icons 192 and 512), `apps/web/public/icons/icon-192.png`, `icon-512.png`,
  `apple-touch-icon.png` (180), made from the brand mark in `apps/web/src/ui/AppBrand.vue`
- Create: `apps/web/public/sw.js` (plain JS, no build)
- Create: `apps/web/src/features/push/usePush.ts`, `apps/web/src/features/push/usePush.test.ts`
- Create: `apps/web/src/components/PushCard.vue`, `apps/web/src/components/PushHint.vue`
- Modify: `apps/web/index.html` (`<link rel="manifest">`, `<link rel="apple-touch-icon">`, `theme-color`),
  `apps/web/public/_headers` (`/sw.js` → `Cache-Control: no-cache`; CSP unchanged, check `manifest-src` falls back to
  `default-src 'self'`), `apps/web/src/components/DeviceSettings.vue` (PushCard above the Telegram card),
  `apps/web/src/components/StudentDashboard.vue` (PushHint at the top), `apps/web/src/messages/en.ts` + `vi.ts`
  (`push` section)

**Interfaces:**
- Consumes: the four `/api/push/*` routes and `PushStatus`/`PushCheck` (Task 3).
- `sw.js`: `push` → `showNotification(title, { body, icon: "/icons/icon-192.png", data: { link } })`;
  `notificationclick` → focus a same-origin window and navigate it to `link`, else `clients.openWindow(link)`.
- Produces: `usePush()` → `{ state: Ref<PushState>; busy: Ref<boolean>; error: Ref<string | null>; enable(): Promise<void>; disable(): Promise<void>; hintDismissed: Ref<boolean>; dismissHint(): void }`,
  `type PushState = "loading" | "hidden" | "unsupported" | "install" | "blocked" | "off" | "on"`.
  - `hidden`: server says `enabled: false`. `install`: iPhone/iPad user agent and not standalone
    (`navigator.standalone` / `matchMedia("(display-mode: standalone)")`). `unsupported`: no `serviceWorker` or
    `PushManager`. `blocked`: `Notification.permission === "denied"`. `on`: a browser subscription exists and
    `/push/check` says true. Else `off`.
  - `enable()`: `Notification.requestPermission()` → when granted, register `/sw.js` (scope `/`), reuse the existing
    subscription if its key matches the server's public key (else unsubscribe and subscribe again with
    `userVisibleOnly: true`), POST `/push/subscribe` with `subscription.toJSON()`.
  - `disable()`: POST `/push/unsubscribe`, then `subscription.unsubscribe()`.
  - `hintDismissed` is kept in `localStorage` under `push-hint-dismissed`.
- Copy (`vi`; write `en` to match): title "Thông báo trên thiết bị"; text "Nhận thông báo ngay trên điện thoại hoặc
  máy tính, kể cả khi không mở Tutorio."; button "Bật thông báo" / "Tắt thông báo"; on "Đã bật trên thiết bị này";
  blocked "Trình duyệt đang chặn thông báo của Tutorio. Hãy cho phép trong phần cài đặt trang web của trình duyệt.";
  install "Trên iPhone/iPad: trong Safari bấm nút Chia sẻ, chọn \"Thêm vào MH chính\", rồi mở Tutorio từ biểu tượng
  mới và bật thông báo tại đây."; unsupported "Trình duyệt này chưa hỗ trợ thông báo."; hint "Bật thông báo để không
  bỏ lỡ bài tập về nhà." with link "Bật ngay" (to `/settings`) and "Để sau" (dismiss).
- PushCard is not shown for `hidden` or `loading`. PushHint shows only for `off` or `install`, not dismissed.

- [ ] **Step 1: Write the failing tests** in `usePush.test.ts`, stubbing `fetch`, `navigator`, `Notification`,
  `window.matchMedia`, `localStorage` as `useTelegram.test.ts` does:
  - `it("is hidden when the server has push off")`.
  - `it("asks iPhone users to add the app to the home screen first")`.
  - `it("is blocked when the browser denied notifications")`.
  - `it("enables: asks permission only when pressed, subscribes with the server key, and sends the subscription")`:
    `requestPermission` not called before `enable()`; `subscribe` called with `applicationServerKey` = decoded key;
    POST body equals `toJSON()`; state `on`.
  - `it("shows off, not on, when this browser's subscription belongs to another session")` (`/push/check` false).
  - `it("disables: tells the server, then unsubscribes the browser")`.
  - `it("remembers that the hint was dismissed")`.

- [ ] **Step 2: Run them and see them fail** — `pnpm --filter @lms/web test` → FAIL (module not found).

- [ ] **Step 3: Implement** the files above. UI only in `components/` and `ui/`; `features/push` imports no `.vue`
  (`architecture.test.ts`). Only design tokens for colours.

- [ ] **Step 4: Run** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` → PASS; then `pnpm dev`, open
  `http://localhost:8787`, sign in as a student and check in Chrome: the hint shows, "Bật thông báo" asks permission,
  the card says "Đã bật", publishing homework as the teacher shows a system notification (with `VAPID_*` set in
  `.dev.vars`), and tapping it opens the work.

- [ ] **Step 5: Commit** — `feat: turn on browser notifications from Settings, with a hint for students`

---

### After the tasks (needs the owner's go-ahead, not done automatically)

- Deploy to staging, set `VAPID_PRIVATE_KEY` with `wrangler secret put`, and read the CPU time of a publish to a full
  class and of the minute job in Workers observability. If a run gets close to 10 ms, lower `REQUEST_SEND_LIMIT` /
  `JOB_SEND_LIMIT`, and write down the measured numbers in `docs/spikes.md`.
- Test on a real iPhone (iOS 16.4+, added to the home screen) and an Android phone.
