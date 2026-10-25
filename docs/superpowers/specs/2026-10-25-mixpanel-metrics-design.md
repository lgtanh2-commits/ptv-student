# Product metrics in Mixpanel

## Why

The owner wants to know two things, filtered by any date range:

1. Does the welcome page bring new people in? How many view it, how many click to create an account, how many
   actually sign up.
2. Do people who signed up come back day after day?

Only the owner looks at these numbers. They live in **Mixpanel**, project **Tutorio** (project id 4077130), in the
owner's own Mixpanel organization (separate from their work organization, so nobody else can see it). The Mixpanel
connector in this Claude session is connected to that account, so the dashboard is built there directly.

## What the owner decided

- **Mixpanel, not a page inside Tutorio.** Mixpanel already does funnels, daily active users, retention and date
  filters.
- **The four numbers**, all filterable by date range:
  1. Total users, **teachers and students counted separately**. A student counts only once they **have an account**
     (accepted an invite or signed in); students a teacher only added by name do not count.
  2. Daily active users (people who used the app that day), split by teacher/student.
  3. Total views of the welcome page.
  4. Total clicks to create an account. **Both** sign-up buttons count — "Tạo tài khoản" (email) and "Tiếp tục với
     Google" — in **all three places** on the welcome page (top bar, hero, bottom). Each click records which button and
     which place, so they can be split later.
- **Privacy:** people are identified by the app's internal user id only. No names, no emails go to Mixpanel. Welcome
  page events are anonymous.
- Project token: `03e57604a295fa0876d150754c47ace0` (public by design; it is what the browser or server sends with
  events).

## Events

| Event             | When                                                                                                                                         | Sent from                                  | Properties                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------- |
| `Welcome Viewed`  | The welcome page (signed-out home page) is shown                                                                                             | the app's own API, on the browser's behalf | anonymous id; referrer host; language                                           |
| `Sign Up Clicked` | A sign-up button on the welcome page is pressed                                                                                              | same                                       | anonymous id; `button`: `email` / `google`; `place`: `top` / `hero` / `bottom`  |
| `Signed Up`       | An account comes into being: a teacher signs up (email confirmed, or Google sign-up), or a student accepts an invite / first gets an account | server                                     | user id; `role`: `teacher` / `student`; `method`: `email` / `google` / `invite` |
| `App Opened`      | A signed-in person uses the app — **at most once per person per day** (Vietnam time)                                                         | server                                     | user id; `role`                                                                 |

User profiles (Mixpanel "People") hold `role` and the account's creation date, so "total users" is a count of profiles
by role.

**Our calls (the owner can change them):**

- **Welcome events go through our own API, not a Mixpanel script in the browser.** The browser keeps a random
  anonymous id in `localStorage` (no cookie) and posts the event to a small endpoint of ours; the Worker forwards it to
  Mixpanel. Why: no third-party script, the strict CSP stays as it is, ad blockers do not drop the events, and the
  visitor's IP is not handed to Mixpanel directly. The endpoint accepts only these two event names and the listed
  properties, and is rate limited like the other public endpoints.
- **The funnel links the anonymous visitor to the new account.** The browser sends its anonymous id with the sign-up
  (email and Google) so `Signed Up` carries it too, and Mixpanel joins "viewed → clicked → signed up" for the same
  person (Mixpanel's simplified identity merge: `$device_id` + `$user_id`).
- **Only production sends events.** Staging and local development send nothing (no token configured), so test traffic
  never mixes with real numbers.
- **"Used the app that day"** = any signed-in request to the API that day; the Worker already updates the session's
  last-seen time, so the first one each day (per person, Vietnam time) sends `App Opened`.
- **Existing users are imported once** (a one-off script the owner runs, or the builder runs with the owner's go-ahead):
  one profile per teacher and per student with an account, with role and creation date, plus a `Signed Up` event dated
  at their creation time, so totals and "new users in this range" are right from the start. Daily activity, views and
  clicks start on the day this ships.

**Calls made after the builder check (ours, the owner can change them):**

- **One person can be a teacher and a student.** The profile has two flags, `is_teacher` and `is_student`, set from the
  person's memberships (any tenant). Total teachers = profiles with `is_teacher`; total students = profiles with
  `is_student`; someone with both counts in both. `App Opened` carries both flags, so DAU can be split either way.
- **`Signed Up` fires once per person, when the account is created** (the user row is inserted), whatever the path:
  email sign-up (`method: email`), Google (`method: google`), invite link (`method: invite`). `role` is the role of
  the membership created with it. When an existing account later gains a role (a teacher invited as a student, or the
  reverse), the profile flag is set and a `Role Added` event (`role`) is sent, so "new students in the range" =
  `Signed Up` with role student + `Role Added` with role student.
- **Daily active:** a small table keyed by user and Vietnam date (`INSERT OR IGNORE`); the first signed-in API request
  of the day for that person sends `App Opened`. Background requests while the app is open (the bell's unread poll)
  count — the person has the app open.
- **Linking the visitor to the account:** the anonymous id travels with the email sign-up request and is kept with the
  pending sign-up, and travels through the Google round trip in its state, so `Signed Up` can carry it even when the
  email is confirmed on another device. When it is missing, the event is sent without it and the funnel under-counts;
  that is accepted.

## The dashboard (built in Mixpanel through the connector)

One board "Tutorio – Growth", date range filter on top, with:

- Total teachers / total students (with accounts), and new teachers / new students in the range.
- Daily active users per day, split by role.
- Welcome page views per day, and total in the range.
- Sign-up clicks per day (split by button and place), and total in the range.
- Funnel: Welcome Viewed → Sign Up Clicked → Signed Up (conversion %).
- Retention: of people who signed up in the range, how many came back on later days (by role).

## Goals

1. Every number above can be read for any date range without asking anyone.
2. No personal data (names, emails, phone numbers) leaves the app.
3. Recording an event never slows down or breaks what the person is doing (best-effort, sent after the response, like
   push and Telegram today).

## Non-goals

- No dashboard page inside Tutorio.
- No tracking of what people do inside the app beyond "opened the app today" and sign-ups.
- No cookie banner (nothing sets a cookie).

## Constraints

- Cloudflare Workers Free plan: 50 outgoing requests and 10 ms CPU per invocation; one Mixpanel request per event
  (or a small batch) is fine. Use `ctx.defer` so it happens after the response.
- The existing CSP must not need changing for this.
- Bilingual app: event names and property values are English and fixed (not translated).
- Students may be minors: only ids and role, nothing else.

## Left to the builder

- Mixpanel ingestion endpoint and format (e.g. `/import` with the project token, or `/track`), and how the token is
  configured per environment (a production var; absent elsewhere).
- Exact API route and validation for the browser events; where the anonymous id is created and sent with sign-up
  (including the Google round trip).
- How "first request of the day per person" is detected cheaply (e.g. a column or a small table keyed by user and day).
- The one-off import script for existing users.
- Building the dashboard reports through the Mixpanel connector after events start arriving.
- Docs: deploy.md (token setup), production.md ("Personal data": what goes to Mixpanel).
