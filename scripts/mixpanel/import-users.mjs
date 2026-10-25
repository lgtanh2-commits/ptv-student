#!/usr/bin/env node
// One-off import of the people who already have an account into Mixpanel (developer tooling, not CI).
//   node scripts/mixpanel/import-users.mjs --env production --before 2026-10-26T03:00:00Z --dry-run   counts, sends nothing
//   node scripts/mixpanel/import-users.mjs --env production --before 2026-10-26T03:00:00Z             the real import
// --before (required) is the production deploy time: people from then on are sent live by the app, not by this.
// --env staging is only allowed with --dry-run.
// Reads production D1 read-only (SELECT only, through wrangler). The real run needs, from the environment:
//   MIXPANEL_SA_USERNAME, MIXPANEL_SA_SECRET (service account), MIXPANEL_PROJECT_ID, MIXPANEL_TOKEN.
// Nothing here is written to a file. Delete the service account when the import is done (docs/deploy.md).
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BATCH = 2000;

/**
 * The cutoff of the import: the moment of the production deploy, as an ISO time. Anyone who signed up from then on
 * is sent live by the app (with the time of the sign-up), so the import must stop before it or Mixpanel counts
 * them twice. Returns the time in the form the database stores (UTC, with milliseconds and "Z").
 */
export function parseBefore(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) {
    throw new Error("--before must be an ISO time, e.g. 2026-10-26T03:00:00Z (the production deploy time)");
  }
  const t = Date.parse(value);
  if (Number.isNaN(t)) throw new Error("--before is not a valid time");
  return new Date(t).toISOString();
}

/**
 * Teachers: a teacher membership and a confirmed email (same rule as the live "Signed Up" for email teachers).
 * Students: a student profile that has an account (students.user_id).
 * Only accounts made before the cutoff, and teachers confirmed before it too (a teacher is sent live when the email
 * is confirmed, so one confirmed after the cutoff is already counted by the app).
 * Never selects a name or an email: only ids, dates and what is needed to pick `method`. `before` is a time from
 * `parseBefore`, so it holds only digits, "-", ":", "." "T" and "Z".
 */
export function usersSql(before) {
  if (parseBefore(before) !== before) throw new Error("usersSql wants the time from parseBefore");
  const teacher = `(u.email_verified_at IS NOT NULL AND u.email_verified_at < '${before}' AND EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.role = 'teacher'))`;
  return `
SELECT u.id AS id, u.created_at AS created_at,
  CASE WHEN ${teacher} THEN 1 ELSE 0 END AS is_teacher,
  CASE WHEN EXISTS (SELECT 1 FROM students s WHERE s.user_id = u.id) THEN 1 ELSE 0 END AS is_student,
  CASE WHEN EXISTS (SELECT 1 FROM identities i WHERE i.user_id = u.id AND i.provider = 'google') THEN 1 ELSE 0 END AS has_google
FROM users u
WHERE u.created_at < '${before}'
  AND (${teacher}
   OR EXISTS (SELECT 1 FROM students s WHERE s.user_id = u.id))
ORDER BY u.created_at, u.id`;
}

/**
 * The role and method of the Signed Up event. The sign-up path is not stored, so it is inferred:
 * a teacher with a linked Google account is `google`, any other teacher `email`; a person who is only a student
 * came through an invite link (`invite`). Someone who is both is dated by their account, as a teacher.
 */
export function signUpOf(row) {
  if (row.is_teacher) return { role: "teacher", method: row.has_google ? "google" : "email" };
  return { role: "student", method: "invite" };
}

/** Same shapes as apps/api/src/analytics/events.ts (signedUp, identity) and mixpanel.ts (setProfile). Keep in step. */
export function buildPayloads(rows, token) {
  const events = [];
  const profiles = [];
  for (const r of rows) {
    const { role, method } = signUpOf(r);
    const set = { $created: r.created_at };
    if (r.is_teacher) set.is_teacher = true;
    if (r.is_student) set.is_student = true;
    profiles.push({ $token: token, $distinct_id: r.id, $set: set });
    events.push({
      event: "Signed Up",
      properties: {
        distinct_id: r.id,
        $user_id: r.id,
        role,
        method,
        time: Date.parse(r.created_at),
        $insert_id: `signed-up:${r.id}`,
      },
    });
  }
  return { events, profiles };
}

const chunks = (list, n) =>
  Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

function readUsers(env, before) {
  const out = execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--env",
      env,
      "--remote",
      "--json",
      "--command",
      usersSql(before),
    ],
    { cwd: path.join(root, "apps/api"), encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  const parsed = JSON.parse(out.slice(out.indexOf("[")));
  return parsed[0].results;
}

async function post(url, body, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${new URL(url).pathname} answered ${res.status}: ${text.slice(0, 300)}`);
  return text;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const env = value("--env");
  const usage = "usage: import-users.mjs --env production --before <ISO deploy time> [--dry-run]";
  if (!["production", "staging"].includes(env)) throw new Error(usage);
  if (env === "staging" && !dryRun) throw new Error("--env staging only works together with --dry-run");
  if (value("--before") === undefined) throw new Error(`--before is required. ${usage}`);
  const before = parseBefore(value("--before"));
  console.log(`only accounts made before ${before}`);
  const rows = readUsers(env, before);
  const teachers = rows.filter((r) => r.is_teacher).length;
  const students = rows.filter((r) => r.is_student).length;
  const both = rows.filter((r) => r.is_teacher && r.is_student).length;
  console.log(`people: ${rows.length}  teachers: ${teachers}  students: ${students}  both: ${both}`);

  const { events, profiles } = buildPayloads(rows, dryRun ? "<token>" : process.env.MIXPANEL_TOKEN);
  if (dryRun) {
    console.log("sample Signed Up event (ids only):", JSON.stringify(events[0]));
    console.log("sample profile (ids only):", JSON.stringify(profiles[0]));
    console.log(
      `would send ${chunks(events, BATCH).length} /import batch(es) and ${chunks(profiles, BATCH).length} /engage batch(es). Nothing was sent.`,
    );
    return;
  }
  const {
    MIXPANEL_SA_USERNAME: user,
    MIXPANEL_SA_SECRET: secret,
    MIXPANEL_PROJECT_ID: project,
    MIXPANEL_TOKEN: token,
  } = process.env;
  if (!user || !secret || !project || !token) {
    throw new Error("set MIXPANEL_SA_USERNAME, MIXPANEL_SA_SECRET, MIXPANEL_PROJECT_ID and MIXPANEL_TOKEN");
  }
  const auth = { authorization: `Basic ${Buffer.from(`${user}:${secret}`).toString("base64")}` };
  // Events first (strict: the whole batch is refused if one event is malformed); $insert_id makes a re-run safe.
  for (const batch of chunks(events, BATCH)) {
    await post(
      `https://api.mixpanel.com/import?strict=1&project_id=${encodeURIComponent(project)}`,
      batch,
      auth,
    );
  }
  for (const batch of chunks(profiles, BATCH)) {
    await post("https://api.mixpanel.com/engage?ip=0", batch);
  }
  console.log(`sent ${events.length} Signed Up events and ${profiles.length} profiles`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(String(e.message ?? e));
    process.exit(1);
  });
}
