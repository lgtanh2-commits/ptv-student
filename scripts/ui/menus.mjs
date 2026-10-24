// Checks the top of every page that has buttons or a "⋯" menu on a phone (360 and 390 wide, Vietnamese and English):
// - every button label in the page header stays on one line and inside the screen;
// - the "⋯" menu, once open, is fully inside the screen (so every item can be reached).
// Developer tooling: it needs the local app running (`cd apps/api && corepack pnpm exec wrangler dev --port 8787`,
// after building the web) and the local teacher account below with some data (see scripts/i18n/screens.mjs).
// It is not part of CI. Exits 1 when any check fails.
//
//   PLAYWRIGHT_PATH=/path/to/playwright/index.mjs node scripts/ui/menus.mjs [base-url] [output-dir]
//
// With an output dir it also saves a screenshot of each open menu.
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
const WIDTHS = [360, 390];
const LANGUAGES = ["vi", "en"];
const MORE = /Thao tác khác|More actions/;

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const failures = [];

const get = async (route) =>
  (await page.request.get(`${BASE}/api${route}`, { headers: { "x-lms-client": "web" } }))
    .json()
    .catch(() => null);
const list = (data) => Object.values(data ?? {}).find(Array.isArray) ?? [];

// Sign in once.
await page.goto(`${BASE}/api/auth/google/start?intent=sign-in&keep=1`);
await page.waitForURL(/dev\/google/);
await page.locator("input").nth(0).fill(TEACHER.email);
await page.locator("input").nth(1).fill(TEACHER.name);
await page.locator("button[type=submit]").click();
await page.waitForTimeout(2500);

// The pages to check: every page with header buttons or a "⋯" menu, in each state the data offers.
const routes = ["/courses", "/students", "/schedule", "/invoices", "/feedback"];
for (const c of list(await get("/courses?page=1&pageSize=50")).filter((c) => c.status !== "archived")) {
  routes.push(`/courses/${c.id}`);
  const assignment = list(await get(`/courses/${c.id}/assignments`))[0];
  if (assignment) routes.push(`/assignments/${assignment.id}`);
  const lessons = list(await get(`/courses/${c.id}/lessons`));
  const scheduled = lessons.find((l) => l.status === "scheduled");
  const cancelled = lessons.find((l) => l.status === "cancelled");
  if (scheduled) routes.push(`/lessons/${scheduled.id}/attendance`);
  if (cancelled) routes.push(`/lessons/${cancelled.id}/attendance`);
  if (assignment && scheduled) break;
}
const students = list(await get("/students?page=1&pageSize=100"));
for (const s of [students.find((s) => s.access === "joined"), students.find((s) => s.access !== "joined")])
  if (s) routes.push(`/students/${s.id}`);
for (let back = 0; back < 3; back++) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - back, 1);
  const invoice = list(await get(`/invoices?period=${d.toISOString().slice(0, 7)}`))[0];
  if (invoice) {
    routes.push(`/invoices/${invoice.id}`);
    break;
  }
}

for (const lang of LANGUAGES) {
  await page.request.fetch(`${BASE}/api/me/language`, {
    method: "PUT",
    headers: { "x-lms-client": "web", "content-type": "application/json" },
    data: JSON.stringify({ language: lang }),
  });
  await page.evaluate((l) => localStorage.setItem("lms.lang", l), lang);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of routes) {
      const where = `${lang} ${width} ${route}`;
      await page.goto(BASE + route);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(300);
      // Header buttons: one line each, inside the screen.
      const buttons = await page.evaluate(() =>
        [...document.querySelectorAll("main > header .btn")]
          .filter((b) => b.offsetParent !== null)
          .map((b) => {
            const r = b.getBoundingClientRect();
            // The lines of the label: the text only (an icon is not a line of text).
            const tops = [];
            const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
              const range = document.createRange();
              range.selectNodeContents(n);
              for (const x of range.getClientRects()) if (x.width > 0) tops.push(Math.round(x.top));
            }
            const lines = new Set(tops);
            return { text: b.textContent.trim(), left: r.left, right: r.right, lines: lines.size };
          }),
      );
      for (const b of buttons) {
        if (b.lines > 1) failures.push(`${where}: "${b.text}" wraps onto ${b.lines} lines`);
        if (b.left < 0 || b.right > width) failures.push(`${where}: "${b.text}" is outside the screen`);
      }
      // The "⋯" menu: open it, its list must be inside the screen.
      const more = page.getByRole("button", { name: MORE });
      if ((await more.count()) === 0) continue;
      await more.click();
      const box = await page.getByRole("menu").boundingBox();
      if (!box) failures.push(`${where}: the menu did not open`);
      else if (box.x < 0 || box.y < 0 || box.x + box.width > width)
        failures.push(`${where}: the menu is outside the screen (${JSON.stringify(box)})`);
      if (OUT)
        await page.screenshot({
          path: path.join(OUT, `${lang}-${width}${route.replaceAll("/", "-")}-menu.png`),
        });
      await page.keyboard.press("Escape");
      console.log(`checked  ${where}`);
    }
  }
}

await browser.close();
console.log(`\n${routes.length} pages × ${WIDTHS.length} widths × ${LANGUAGES.length} languages.`);
if (failures.length) {
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log("All header buttons stay on one line and every menu opens inside the screen.");
