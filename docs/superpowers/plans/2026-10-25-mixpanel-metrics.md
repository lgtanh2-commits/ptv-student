# Mixpanel Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send sign-up, daily-activity and welcome-page events to Mixpanel (project Tutorio), import existing users once,
so the owner's dashboard can count users, DAU, welcome views and sign-up clicks over any date range.

**Architecture:** A small server-side Mixpanel client in the Worker sends every event (no Mixpanel script in the
browser). Browser events from the welcome page go through a new public endpoint of ours. Account events come from the
existing sign-up / invite / Google code paths; daily activity from the auth middleware with a per-day table.

**Tech Stack:** Cloudflare Workers + D1 + Hono + Zod, Vue 3, vitest, Mixpanel HTTP APIs (`/track`, `/engage`,
`/import`).

**Spec:** `docs/superpowers/specs/2026-10-25-mixpanel-metrics-design.md`

## Global Constraints

- Only production sends events: env var `MIXPANEL_TOKEN` set in `wrangler.jsonc` `env.production.vars` to
  `03e57604a295fa0876d150754c47ace0`; absent in local, test and staging → every send is a no-op.
- Event names exactly: `Welcome Viewed`, `Sign Up Clicked`, `Signed Up`, `Role Added`, `App Opened`. Property values
  English and fixed: `role` teacher|student, `method` email|google|invite, `button` email|google, `place`
  top|hero|bottom.
- Never send names, emails, phone numbers or free text. Identify people by the internal user id only.
- Sending never fails or slows an action: `ctx.defer`, catch and log (`{"msg":"mixpanel send failed"}`), 5 s timeout.
- Vietnam date for "day": `Asia/Ho_Chi_Minh`.
- Profile properties: `is_teacher`, `is_student` (booleans), `$created` (account creation time).
- No cookie; the browser's anonymous id lives in `localStorage` key `lms.anon`.
- CSP unchanged.
- Commit with explicit paths; never commit secrets.

## Review Focus

1. A teacher who signs up but never confirms the email must not count: `Signed Up` for the email path fires at
   confirmation (`verifyEmail`), not at the sign-up request. Test in Task 1.
2. A second invite to someone who already has an account must not send another `Signed Up` (only `Role Added` if the
   role is new). Test in Task 1.
3. `App Opened` at most once per person per Vietnam day even with many requests across UTC midnight. Test in Task 1.
4. The public events endpoint must refuse unknown event names, extra properties and oversize ids, and be rate limited.
   Test in Task 2.
5. Staging/local (no token) never calls Mixpanel. Test in Task 1.

---

### Task 1: Server: Mixpanel client, account events, daily activity

**Files:**

- Create: `apps/api/src/analytics/mixpanel.ts`, `apps/api/src/analytics/events.ts`, `apps/api/migrations/0024_analytics.sql`
- Modify: `apps/api/src/env.ts` (`MIXPANEL_TOKEN?`), `apps/api/wrangler.jsonc` (production var + comment),
  `apps/api/src/auth/service.ts` (`signUp` stores the anonymous id; `verifyEmail` → `Signed Up`),
  the Google account-creation path in `apps/api/src/auth/google.ts` / `apps/api/src/google/flow.ts`,
  `apps/api/src/students/invites.ts` (`acceptInvite`), `apps/api/src/middleware/auth.ts` (`loadActor`),
  `packages/shared/src/schemas.ts` (`signUpBody.anonymousId` optional), `apps/api/test/helpers.ts` (a `mixpanelFake`
  in the fetch stub for `https://api.mixpanel.com/*`)
- Test: `apps/api/test/analytics.test.ts`

**Interfaces:**

- Migration `0024_analytics.sql` (expand only): `ALTER TABLE users ADD COLUMN signup_anon_id TEXT;` and
  `CREATE TABLE user_active_days (user_id TEXT NOT NULL REFERENCES users(id), day TEXT NOT NULL, PRIMARY KEY (user_id, day));`
  (maintenance: delete rows older than 400 days).
- `mixpanel.ts`: `track(env: Env, events: MixpanelEvent[]): Promise<void>` (POST `/track`, JSON, token in each
  event's properties) and `setProfile(env: Env, userId: string, set: Record<string, unknown>): Promise<void>` (POST
  `/engage#profile-set`). Both return immediately when `MIXPANEL_TOKEN` is unset. `MixpanelEvent = { event: string;
properties: Record<string, string | number | boolean> }`; `distinct_id` = user id for identified events, plus
  `$user_id` and, when known, `$device_id` (simplified identity merge); `time` in ms; `$insert_id` = a stable id
  (e.g. `signed-up:<userId>`, `app-opened:<userId>:<day>`) so retries never double count.
- `events.ts` (what the rest of the app calls; all fire-and-forget through `ctx.defer`):
  `signedUp(ctx, o: { userId: string; role: "teacher" | "student"; method: "email" | "google" | "invite"; anonymousId?: string | null; createdAt: string })`
  — sends `Signed Up` and sets the profile (`is_teacher`/`is_student`, `$created`);
  `roleAdded(ctx, o: { userId: string; role: "teacher" | "student" })`;
  `appOpened(ctx, actor: Actor)` — inserts `(user_id, today in Vietnam)` with `INSERT OR IGNORE ... RETURNING`; only
  when a row came back it sends `App Opened` with `is_teacher`/`is_student` from `actor.memberships`.
- Where they fire: email sign-up → `signUp` saves `input.anonymousId` into `users.signup_anon_id`; `verifyEmail` sends
  `signedUp(method "email", role "teacher", anonymousId = signup_anon_id)` only the first time the email gets
  verified. Google sign-up that creates a user → `signedUp(method "google", role of the membership created)`, with the
  anonymous id carried in the Google flow state (`Flow.anonymousId?`). `acceptInvite`: new user →
  `signedUp(method "invite", role "student")`; existing user without a student membership before →
  `roleAdded(role "student")`; existing student → nothing. `loadActor` → `appOpened` for every signed-in request
  (cheap: one `INSERT OR IGNORE`; the send happens only on the first of the day).

- [ ] **Step 1: Write the failing tests** in `apps/api/test/analytics.test.ts` (enable the token with
      `call(..., { env: { MIXPANEL_TOKEN: "test-token" } })` / an env override, and read `mixpanelFake.sent`):
  - `it("sends nothing anywhere when no token is set")`
  - `it("sends Signed Up for a teacher only when the email is confirmed, with the sign-up's anonymous id")`:
    sign up (with `anonymousId: "anon-1"`) → nothing sent; confirm → one `Signed Up` `{ role: "teacher", method: "email", $device_id: "anon-1", $user_id: <id> }` and a profile with `is_teacher: true`; confirming again (a second link) sends nothing more.
  - `it("sends Signed Up once for a student who accepts an invite, and Role Added when a teacher becomes a student")`
  - `it("does not send anything for a second invite to someone who is already a student")`
  - `it("sends App Opened once per person per Vietnam day")`: several requests → one event; move the clock to the next
    Vietnam day (00:30 VN = 17:30 UTC previous day) → one more; requests at 23:30 UTC and 00:30 UTC on the same VN day
    → still one.
  - `it("never sends a name or an email")`: every captured payload, stringified, contains neither.
  - `it("an action still succeeds when Mixpanel fails")`: `mixpanelFake.status = 500` → sign up/confirm still 2xx.
- [ ] **Step 2:** run `pnpm --filter @lms/api exec vitest run test/analytics.test.ts` → FAIL.
- [ ] **Step 3:** implement the files above.
- [ ] **Step 4:** `pnpm test && pnpm typecheck && pnpm lint` → PASS.
- [ ] **Step 5:** commit `feat: account and daily activity events to Mixpanel`.

### Task 2: Welcome page events

**Files:**

- Create: `apps/api/src/routes/events.ts` (+ register in `app.ts`, `routes/access.ts` as public), `apps/web/src/features/analytics/anon.ts` (+ test)
- Modify: `packages/shared/src/schemas.ts` (`publicEventBody`), `apps/web/src/components/LandingPage.vue`,
  the sign-up form (`apps/web/src/pages/SignUpPage.vue` / its feature) to send `anonymousId`,
  `apps/web/src/components/GoogleButton.vue` (pass the anonymous id to `/api/auth/google/start` as a query param that
  the API stores in the flow state)
- Test: `apps/api/test/events.test.ts`, `apps/web/src/features/analytics/anon.test.ts`

**Interfaces:**

- `POST /api/events` (public, CSRF rules like other public POSTs, rate limit `events:ip:<hash>` 120/hour) body
  `publicEventBody = z.discriminatedUnion("event", [ z.object({ event: z.literal("Welcome Viewed"), anonymousId, referrer: z.string().max(100).optional() }), z.object({ event: z.literal("Sign Up Clicked"), anonymousId, button: z.enum(["email","google"]), place: z.enum(["top","hero","bottom"]) }) ])`,
  `anonymousId = z.string().regex(/^[A-Za-z0-9-]{8,64}$/)`, `.strict()` objects. Answers 204; forwards with
  `distinct_id = $device_id = anonymousId`, `referrer` reduced to its host, `language` from the request.
- `anon.ts`: `anonymousId(): string` (reads/creates `lms.anon` in localStorage, a random UUID; falls back to a
  per-page-load id when storage throws), `sendEvent(body): void` (fire-and-forget `fetch` with `keepalive: true`,
  errors swallowed).
- `LandingPage.vue`: `Welcome Viewed` once on mount; each sign-up button sends `Sign Up Clicked` with its `button`
  and `place` before navigating.

- [ ] **Step 1: Tests**: API — accepts both events and forwards them (`mixpanelFake.sent` has `$device_id`); refuses
      an unknown event, an extra property, a bad id (400); rate limited (429 after the limit); no forward without token.
      Web — `anonymousId()` is stable across calls and survives a throwing storage.
- [ ] **Step 2–4:** fail, implement, `pnpm test && pnpm test:scripts && pnpm typecheck && pnpm lint && pnpm build`.
- [ ] **Step 5:** commit `feat: welcome page views and sign-up clicks to Mixpanel`.

### Task 3: One-off import of existing users, and docs

**Files:**

- Create: `scripts/mixpanel/import-users.mjs` (developer tooling, not CI)
- Modify: `docs/deploy.md` (Mixpanel section: token in production vars; staging and local send nothing; how to run
  the import), `docs/production.md` ("Personal data": ids and role only go to Mixpanel)

**Interfaces:**

- `node scripts/mixpanel/import-users.mjs --env production [--dry-run]` with `MIXPANEL_SA_USERNAME`,
  `MIXPANEL_SA_SECRET`, `MIXPANEL_PROJECT_ID`, `MIXPANEL_TOKEN` from the environment (never from a file in the repo).
  Reads production D1 read-only through `pnpm exec wrangler d1 execute DB --env production --remote --json --command "SELECT ..."`:
  teachers = users with a teacher membership **and** `email_verified_at IS NOT NULL`; students = users with a student
  membership (`students.user_id` set). Sends profiles (`/engage`, `$created`, `is_teacher`, `is_student`) and one
  `Signed Up` per user dated at `users.created_at` through `/import?strict=1&project_id=…` with service-account basic
  auth, `$insert_id = signed-up:<userId>` (same id as Task 1, so a user imported and later re-sent is not counted
  twice). Batches of ≤ 2000. `--dry-run` prints the counts and one sample payload with ids only.
- [ ] Dry-run against production prints counts; commit `chore: one-off Mixpanel import of existing users, docs`.

### After the tasks (controller, with the owner's go-ahead)

- Deploy (production), run the import (real run), check events arrive, build the dashboard "Tutorio – Growth" in
  Mixpanel through the connector (reports listed in the spec), tell the owner to delete the service account.
