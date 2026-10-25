import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildPayloads, parseBefore, usersSql } from "./mixpanel/import-users.mjs";

const script = fileURLToPath(new URL("./mixpanel/import-users.mjs", import.meta.url));
const run = (...args) => spawnSync("node", [script, ...args], { encoding: "utf8" });

test("parseBefore turns an ISO time into the stored form and refuses anything else", () => {
  assert.equal(parseBefore("2026-10-26T10:00:00+07:00"), "2026-10-26T03:00:00.000Z");
  assert.equal(parseBefore("2026-10-26"), "2026-10-26T00:00:00.000Z");
  for (const bad of [undefined, "", "now", "yesterday", "2026-13-45", "x'; DROP TABLE users;--"]) {
    assert.throws(() => parseBefore(bad), /--before/);
  }
});

test("the query keeps only accounts made before the cutoff, and teachers confirmed before it", () => {
  const sql = usersSql("2026-10-26T03:00:00.000Z");
  assert.match(sql, /WHERE u\.created_at < '2026-10-26T03:00:00\.000Z'/);
  assert.match(sql, /u\.email_verified_at < '2026-10-26T03:00:00\.000Z'/);
  assert.throws(() => usersSql("2026-10-26"), /parseBefore/);
  assert.throws(() => usersSql("' OR 1=1 --"), /--before/);
});

test("the script refuses to run without --before, even as a dry run", () => {
  for (const args of [
    ["--env", "production"],
    ["--env", "production", "--dry-run"],
  ]) {
    const r = run(...args);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /--before is required/);
  }
  const bad = run("--env", "production", "--before", "soon", "--dry-run");
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /--before must be an ISO time/);
});

test("--env staging only works with --dry-run", () => {
  const r = run("--env", "staging", "--before", "2026-10-26T03:00:00Z");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /staging only works together with --dry-run/);
});

test("a teacher with Google is google, a teacher without is email, a student is invite", () => {
  const rows = [
    { id: "a", created_at: "2026-01-01T00:00:00.000Z", is_teacher: 1, is_student: 0, has_google: 1 },
    { id: "b", created_at: "2026-01-02T00:00:00.000Z", is_teacher: 1, is_student: 1, has_google: 0 },
    { id: "c", created_at: "2026-01-03T00:00:00.000Z", is_teacher: 0, is_student: 1, has_google: 0 },
  ];
  const { events } = buildPayloads(rows, "t");
  assert.deepEqual(
    events.map((e) => [e.properties.role, e.properties.method]),
    [
      ["teacher", "google"],
      ["teacher", "email"],
      ["student", "invite"],
    ],
  );
});

test("the Signed Up insert id is the one the app sends, and one Mixpanel accepts", () => {
  const id = "01a0ba80-7f6d-74dd-b612-1e7326035b66";
  const { events } = buildPayloads(
    [{ id, created_at: "2026-01-01T00:00:00.000Z", is_teacher: 1, is_student: 0, has_google: 0 }],
    "t",
  );
  const insertId = events[0].properties.$insert_id;
  assert.equal(insertId, "su01a0ba807f6d74ddb6121e7326035b66");
  assert.match(insertId, /^[A-Za-z0-9!#$%^&*+_-]{1,36}$/);
});
