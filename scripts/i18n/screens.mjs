// Screenshots every public, teacher and student screen at 1280 and 390 wide in Vietnamese and English and
// prints how far each page sticks out sideways (0px is the goal). Developer tooling: it needs the local app
// running (`cd apps/api && corepack pnpm exec wrangler dev --port 8787`, after building the web) and the local
// accounts below (sign up once through /dev/google). It is not part of CI.
//
//   PLAYWRIGHT_PATH=/path/to/playwright/index.mjs node scripts/i18n/screens.mjs <output-dir> [base-url]
//
// PLAYWRIGHT_PATH defaults to the copy in the npx cache; Chrome is the installed one (channel "chrome").
// Data the screens need (a course, a homework, a draft receipt, an invite link) is looked up through the
// API; whatever is missing is added. Existing local data is only added to, never removed.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PLAYWRIGHT =
  process.env.PLAYWRIGHT_PATH ?? "/Users/tamanh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
const { chromium } = await import(pathToFileURL(path.resolve(PLAYWRIGHT)).href);

const OUT = path.resolve(process.argv[2] ?? "screens-out");
const BASE = process.argv[3] ?? "http://localhost:8787";
const TEACHER = { email: "lan.teacher@example.com", name: "Lan Teacher" };
const STUDENT = { email: "mai.student@example.com", name: "Hoang Mai" };
const LANGUAGES = ["vi", "en"];
const VIEWPORTS = [
  ["d", { width: 1280, height: 800 }],
  ["m", { width: 390, height: 844 }],
];
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const sessions = new Map();
const rows = [];
const problems = [];

/** A browser session for one person in one language. */
async function open(viewport, lang, who) {
  // One sign-in per person (the sign-in limit is per address), then the saved session is reused.
  const context = await browser.newContext({
    viewport,
    storageState: who ? sessions.get(who.email) : undefined,
  });
  const remember = (l) => localStorage.setItem("lms.lang", l);
  const page = await context.newPage();
  page.on(
    "console",
    (m) =>
      m.type() === "error" &&
      !/status of 401/.test(m.text()) &&
      problems.push(`${page.url()}: console ${m.text()}`),
  );
  if (who && !sessions.has(who.email)) {
    await page.goto(`${BASE}/api/auth/google/start?intent=sign-in&keep=1`);
    await page.waitForURL(/dev\/google/);
    await page.locator("input").nth(0).fill(who.email);
    await page.locator("input").nth(1).fill(who.name);
    await page.locator("button[type=submit]").click();
    // The page may reload once to take the account's language, so just wait a moment.
    await page.waitForTimeout(2500);
    sessions.set(who.email, await context.storageState());
  }
  if (who) {
    await call(page, "PUT", "/me/language", { language: lang });
  }
  // Only now: forcing the language earlier would fight the account's language right after sign-in.
  await context.addInitScript(remember, lang);
  return { context, page };
}

async function call(page, method, route, body) {
  const res = await page.request.fetch(`${BASE}/api${route}`, {
    method,
    headers: { "x-lms-client": "web", "content-type": "application/json" },
    data: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json().catch(() => null);
}
const first = (data) => Object.values(data ?? {}).find(Array.isArray) ?? [];

/** Finds (or makes) what the pages need. */
async function seed() {
  const { context, page } = await open(VIEWPORTS[0][1], "en", TEACHER);
  const ids = {};
  const courses = first(await call(page, "GET", "/courses?page=1&pageSize=50")).filter(
    (c) => c.status !== "archived",
  );
  // The first course that has homework and lessons, so the course-based screens are not empty.
  for (const c of courses) {
    const assignments = first(await call(page, "GET", `/courses/${c.id}/assignments`));
    const lessons = first(await call(page, "GET", `/courses/${c.id}/lessons`));
    if (assignments.length && lessons.length) {
      ids.course = c.id;
      ids.assignment = assignments[0].id;
      ids.lesson = (lessons.find((l) => l.startsAt < new Date().toISOString()) ?? lessons[0]).id;
      break;
    }
  }
  if (!ids.course) throw new Error("The teacher has no course with homework and lessons: create one first.");
  const students = first(await call(page, "GET", "/students?page=1&pageSize=100"));
  ids.student = students.find((s) => s.email === STUDENT.email)?.id ?? students[0]?.id;
  // The newest month that has a receipt (this month and the two before).
  for (let back = 0; back < 3 && !ids.invoice; back++) {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - back, 1);
    ids.invoice = first(await call(page, "GET", `/invoices?period=${d.toISOString().slice(0, 7)}`))[0]?.id;
  }
  // A fresh invite, so the accept-invite screen has a real link.
  const stamp = Date.now();
  await call(page, "POST", "/students", {
    name: "Invite Sweep",
    email: `invite.sweep.${stamp}@example.com`,
    phone: "",
    invite: true,
  });
  const outbox = (await call(page, "GET", "/dev/outbox"))?.emails ?? [];
  ids.invite = outbox.map((e) => e.body_text.match(/http\S+accept-invite\S+/)?.[0]).find(Boolean);
  await context.close();
  const s = await open(VIEWPORTS[0][1], "en", STUDENT);
  ids.myInvoice = first(await call(s.page, "GET", "/my/invoices"))[0]?.id;
  ids.myWork = ids.assignment;
  ids.myCourse = (first(await call(s.page, "GET", "/my/courses"))[0] ?? { id: ids.course }).id ?? ids.course;
  await s.context.close();
  return ids;
}

const ids = await seed();
const publicPages = [
  ["home", "/"],
  ["sign-in", "/sign-in"],
  ["sign-up", "/sign-up"],
  ["verify-email", "/verify-email"],
  ["magic-link", "/magic-link"],
  ["not-found", "/no-such-page"],
];
if (ids.invite) publicPages.push(["accept-invite", ids.invite.replace(BASE, "")]);
const teacherPages = [
  ["home", "/"],
  ["settings", "/settings"],
  ["courses", "/courses"],
  ["course-new", "/courses/new"],
  ["course-detail", `/courses/${ids.course}`],
  ["students", "/students"],
  ["student-import", "/students/import"],
  ["student-detail", `/students/${ids.student}`],
  ["schedule", "/schedule"],
  ["attendance", `/lessons/${ids.lesson}/attendance`],
  ["homework-new", `/courses/${ids.course}/homework/new`],
  ["assignment", `/assignments/${ids.assignment}`],
  ["assignment-edit", `/assignments/${ids.assignment}/edit`],
  ["grading", `/assignments/${ids.assignment}/students/${ids.student}`],
  ["invoices", "/invoices"],
  ["invoice-new", "/invoices/new"],
  ...(ids.invoice ? [["invoice-detail", `/invoices/${ids.invoice}`]] : []),
];
const studentPages = [
  ["home", "/"],
  ["settings", "/settings"],
  ["my-courses", "/my/courses"],
  ["my-course", `/my/courses/${ids.myCourse}`],
  ["my-work", `/my/work/${ids.myWork}`],
  ["my-invoices", "/my/invoices"],
  ...(ids.myInvoice ? [["my-invoice", `/my/invoices/${ids.myInvoice}`]] : []),
];

for (const lang of LANGUAGES) {
  for (const [size, viewport] of VIEWPORTS) {
    for (const [who, person, pages] of [
      ["public", null, publicPages],
      ["teacher", TEACHER, teacherPages],
      ["student", STUDENT, studentPages],
    ]) {
      const { context, page } = await open(viewport, lang, person);
      for (const [name, route] of pages) {
        await page.goto(BASE + route);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(400);
        const label = `${lang}-${size}-${who}-${name}`;
        await page.screenshot({ path: path.join(OUT, `${label}.png`), fullPage: true });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        rows.push({ label, overflow });
        console.log(`${overflow > 0 ? "OVERFLOW" : "ok      "} ${String(overflow).padStart(4)}px  ${label}`);
      }
      await context.close();
    }
  }
}
await browser.close();

const bad = rows.filter((r) => r.overflow > 0);
if (problems.length) console.log("\nConsole errors:\n" + [...new Set(problems)].join("\n"));
console.log(`\n${rows.length} screens, ${bad.length} with sideways overflow.`);
process.exitCode = bad.length ? 1 : 0;
