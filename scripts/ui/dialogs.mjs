// Opens the app's dialogs on a phone (360 and 390 wide, Vietnamese and English) and checks:
// - the dialog is a sheet at the bottom of the screen, fully inside it;
// - every footer button is inside the screen, full width, on one line, at least 44px tall, the main one (last in the
//   markup) on top;
// - Escape still closes the dialog;
// and on the pages with a sticky action bar (attendance, hand-in): its button is full width and inside the screen,
// and a toast sits in the page gutter without covering the bar.
// Dialogs: a confirm (sign out everywhere, settings), the 3-button cancel-lesson dialog (attendance), the feedback
// form, the hand-in confirm (student).
// Developer tooling: it needs the local app running (`cd apps/api && corepack pnpm exec wrangler dev --port 8787`,
// after building the web) and the local accounts below with some data (see scripts/i18n/screens.mjs): a scheduled
// lesson that repeats. When the student has no homework left to hand in, the teacher gives one ("Dialog check") and
// deletes it at the end. It is not part of CI. Exits 1 when a check fails.
//
//   PLAYWRIGHT_PATH=/path/to/playwright/index.mjs node scripts/ui/dialogs.mjs [base-url] [output-dir]
//
// With an output dir it also saves a screenshot of each open dialog and action bar.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PLAYWRIGHT =
  process.env.PLAYWRIGHT_PATH ?? "/Users/tamanh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
const { chromium } = await import(pathToFileURL(path.resolve(PLAYWRIGHT)).href);

const BASE = process.argv[2] ?? "http://localhost:8787";
const OUT = process.argv[3] ? path.resolve(process.argv[3]) : null;
if (OUT) mkdirSync(OUT, { recursive: true });
const TEACHER = { email: "lan.teacher@example.com", name: "Lan Teacher" };
const STUDENT = { email: "mai.student@example.com", name: "Hoang Mai" };
const WIDTHS = [360, 390];
const HEIGHT = 780;
const LANGUAGES = ["vi", "en"];
const MORE = /Thao tác khác|More actions/;

const browser = await chromium.launch({ channel: "chrome" });
const failures = [];
const skipped = [];

async function signIn(who) {
  const context = await browser.newContext({ viewport: { width: 390, height: HEIGHT } });
  const page = await context.newPage();
  await page.goto(`${BASE}/api/auth/google/start?intent=sign-in&keep=1`);
  await page.waitForURL(/dev\/google/);
  await page.locator("input").nth(0).fill(who.email);
  await page.locator("input").nth(1).fill(who.name);
  await page.locator("button[type=submit]").click();
  await page.waitForTimeout(2500);
  return page;
}
const get = async (page, route) =>
  (await page.request.get(`${BASE}/api${route}`, { headers: { "x-lms-client": "web" } }))
    .json()
    .catch(() => null);
const list = (data) => Object.values(data ?? {}).find(Array.isArray) ?? [];
async function setLanguage(page, lang) {
  await page.request.fetch(`${BASE}/api/me/language`, {
    method: "PUT",
    headers: { "x-lms-client": "web", "content-type": "application/json" },
    data: JSON.stringify({ language: lang }),
  });
  await page.evaluate((l) => localStorage.setItem("lms.lang", l), lang);
}
async function go(page, route) {
  await page.goto(BASE + route);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(300);
}

/** The lines of text of an element (an icon is not a line). */
const LINES = `(el) => {
  const tops = new Set();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const x of range.getClientRects()) if (x.width > 0) tops.add(Math.round(x.top));
  }
  return tops.size;
}`;

async function checkDialog(page, where, name) {
  const dialog = page.locator("dialog[open]");
  if ((await dialog.count()) === 0) {
    failures.push(`${where}: the ${name} dialog did not open`);
    return;
  }
  await page.waitForTimeout(400); // the sheet slides in
  const r = await page.evaluate((linesSrc) => {
    const lines = eval(linesSrc);
    const box = document.querySelector("dialog[open] .modal-box");
    const b = box.getBoundingClientRect();
    // The footer is the last block of the box; other buttons (a segmented choice in a form) are not checked here.
    const buttons = [...box.lastElementChild.querySelectorAll(":scope > .btn")]
      .filter((x) => x.offsetParent !== null)
      .map((x) => {
        const rect = x.getBoundingClientRect();
        return {
          text: x.textContent.trim(),
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          lines: lines(x),
        };
      });
    return {
      box: { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width },
      inner:
        box.clientWidth -
        parseFloat(getComputedStyle(box).paddingLeft) -
        parseFloat(getComputedStyle(box).paddingRight),
      vw: innerWidth,
      vh: innerHeight,
      buttons,
    };
  }, LINES);
  const { box, buttons, vw, vh } = r;
  if (box.left < 0 || box.right > vw + 0.5 || box.top < 0 || box.bottom > vh + 0.5)
    failures.push(`${where}: the ${name} dialog is outside the screen (${JSON.stringify(box)})`);
  if (Math.abs(box.bottom - vh) > 1 || box.width < vw - 1)
    failures.push(`${where}: the ${name} dialog is not a bottom sheet (${JSON.stringify(box)})`);
  if (buttons.length === 0) failures.push(`${where}: the ${name} dialog has no buttons`);
  for (const b of buttons) {
    if (b.left < 0 || b.right > vw + 0.5 || b.bottom > vh + 0.5)
      failures.push(`${where}: "${b.text}" is outside the screen`);
    if (b.lines > 1) failures.push(`${where}: "${b.text}" wraps onto ${b.lines} lines`);
    if (Math.abs(b.width - r.inner) > 1) failures.push(`${where}: "${b.text}" is not full width`);
    if (b.height < 43.5) failures.push(`${where}: "${b.text}" is lower than 44px (${b.height})`);
  }
  // In the markup the main button is last: on a phone it is on top.
  for (let i = 1; i < buttons.length; i++)
    if (buttons[i].top >= buttons[i - 1].top)
      failures.push(`${where}: "${buttons[i].text}" is not above "${buttons[i - 1].text}"`);
  if (OUT) await page.screenshot({ path: path.join(OUT, `${where.replaceAll(" ", "-")}.png`) });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  if ((await page.locator("dialog[open]").count()) > 0)
    failures.push(`${where}: Escape did not close the ${name} dialog`);
  console.log(`checked  ${where}: ${buttons.map((b) => `"${b.text}"`).join(" ")}`);
}

async function checkBar(page, where) {
  const r = await page.evaluate(async () => {
    const bar = document.querySelector("[data-action-bar]");
    if (!bar) return null;
    bar.scrollIntoView({ block: "end" });
    const b = bar.getBoundingClientRect();
    const btn = bar.querySelector(".btn").getBoundingClientRect();
    // A sample toast (the same classes as AppToast's items), measured and removed again.
    const sample = document.createElement("div");
    sample.className = "alert alert-soft w-[calc(100vw-2rem)] items-start shadow-lg sm:w-80";
    sample.textContent = "Đã lưu điểm danh cho cả lớp, các bạn vắng mặt sẽ được báo qua email.";
    document.querySelector(".toast").append(sample);
    await new Promise((done) => setTimeout(done, 500)); // it grows in
    const t = sample.getBoundingClientRect();
    sample.remove();
    return {
      bar: { top: b.top, bottom: b.bottom },
      btn: { left: btn.left, right: btn.right, width: btn.width, height: btn.height },
      inner: bar.clientWidth - 32,
      toast: { left: t.left, right: t.right, bottom: t.bottom },
      scrolls: document.documentElement.scrollHeight > innerHeight,
      vw: innerWidth,
      vh: innerHeight,
    };
  });
  if (!r) {
    skipped.push(`${where}: no action bar on the page`);
    return false;
  }
  if (r.btn.left < 0 || r.btn.right > r.vw + 0.5)
    failures.push(`${where}: the bar button is outside the screen`);
  if (Math.abs(r.btn.width - r.inner) > 1) failures.push(`${where}: the bar button is not full width`);
  if (r.btn.height < 43.5) failures.push(`${where}: the bar button is lower than 44px`);
  // On a page longer than the screen the bar sticks to the bottom; on a short page it ends the content.
  if (r.bar.bottom > r.vh + 1 || (r.scrolls && Math.abs(r.bar.bottom - r.vh) > 1))
    failures.push(`${where}: the bar is not at the bottom (${r.bar.bottom})`);
  if (Math.abs(r.toast.left - 16) > 1 || Math.abs(r.vw - 16 - r.toast.right) > 1)
    failures.push(`${where}: a toast is not inside the 16px gutter (${JSON.stringify(r.toast)})`);
  if (r.toast.bottom > r.bar.top) failures.push(`${where}: a toast would cover the bar`);
  if (OUT) await page.screenshot({ path: path.join(OUT, `${where.replaceAll(" ", "-")}-bar.png`) });
  return true;
}

// Teacher: the confirm, the 3-button cancel-lesson dialog, the feedback form, the attendance bar.
const teacher = await signIn(TEACHER);
let lesson = null;
for (const c of list(await get(teacher, "/courses?page=1&pageSize=50")).filter(
  (c) => c.status !== "archived",
)) {
  lesson = list(await get(teacher, `/courses/${c.id}/lessons`)).find(
    (l) => l.status === "scheduled" && l.seriesId,
  );
  if (lesson) break;
}
if (!lesson) skipped.push("no scheduled lesson that repeats: the 3-button cancel dialog was not checked");
let assignments = [];
for (const c of list(await get(teacher, "/courses?page=1&pageSize=50")))
  assignments.push(...list(await get(teacher, `/courses/${c.id}/assignments`)).map((a) => a.id));

for (const lang of LANGUAGES) {
  await setLanguage(teacher, lang);
  for (const width of WIDTHS) {
    await teacher.setViewportSize({ width, height: HEIGHT });
    await go(teacher, "/settings");
    await teacher.getByRole("button", { name: /Đăng xuất khỏi tất cả thiết bị|Sign out everywhere/ }).click();
    await checkDialog(teacher, `${lang} ${width} confirm`, "confirm");

    await go(teacher, "/feedback");
    await teacher.locator("main header").getByRole("button").last().click();
    await checkDialog(teacher, `${lang} ${width} feedback`, "feedback");

    if (lesson) {
      await go(teacher, `/lessons/${lesson.id}/attendance`);
      await checkBar(teacher, `${lang} ${width} attendance`);
      await teacher.getByRole("button", { name: MORE }).click();
      await teacher.getByRole("menuitem", { name: /Hủy buổi học|Cancel/ }).click();
      await checkDialog(teacher, `${lang} ${width} cancel-lesson`, "cancel-lesson");
    }
  }
}

// Student: the hand-in bar and its confirm.
const student = await signIn(STUDENT);
let work = null;
let seeded = null; // a homework this run gave, deleted at the end (it would change the screenshot sweep's data)
for (const id of assignments) {
  await go(student, `/my/work/${id}`);
  if (await student.locator("[data-action-bar]").count()) {
    work = id;
    break;
  }
}
if (!work) {
  // None left: the teacher gives one (a single written question, no due time) in the student's first course.
  const course = list(await get(student, "/my/courses"))[0];
  const send = (route, body) =>
    teacher.request.post(`${BASE}/api${route}`, {
      headers: { "x-lms-client": "web", "content-type": "application/json" },
      data: JSON.stringify(body),
    });
  if (course) {
    const made = await (
      await send(`/courses/${course.id}/assignments`, {
        title: "Dialog check",
        questions: [{ kind: "written", text: "Write one sentence.", points: 1 }],
      })
    )
      .json()
      .catch(() => null);
    if (made?.assignment) {
      await send(`/assignments/${made.assignment.id}/publish`, {});
      work = made.assignment.id;
      seeded = work;
    }
  }
}
if (!work) skipped.push("no homework the student can still hand in: the hand-in dialog was not checked");
else
  for (const lang of LANGUAGES) {
    await setLanguage(student, lang);
    for (const width of WIDTHS) {
      await student.setViewportSize({ width, height: HEIGHT });
      await go(student, `/my/work/${work}`);
      await checkBar(student, `${lang} ${width} my-work`);
      await student.locator("[data-action-bar] .btn").click();
      await checkDialog(student, `${lang} ${width} hand-in`, "hand-in");
    }
  }

if (seeded) {
  const res = await teacher.request.delete(`${BASE}/api/assignments/${seeded}`, {
    headers: { "x-lms-client": "web" },
  });
  if (!res.ok()) failures.push(`could not delete the "Dialog check" homework ${seeded} (${res.status()})`);
}
await browser.close();
if (skipped.length) console.log(`\nSkipped:\n${skipped.join("\n")}`);
if (failures.length) {
  console.log(`\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("\nEvery dialog opens as a bottom sheet with full-width one-line buttons inside the screen.");
