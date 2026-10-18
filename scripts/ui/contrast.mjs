// Measures the text contrast of the Feedback page (board, empty board, open dialog, dialog errors, toast) in the
// light and the dark theme, for a teacher in English and a student in Vietnamese. Every visible text must reach
// WCAG AA: 4.5:1, or 3:1 for large text (24px and up, or 18.66px and up when bold). Developer tooling: it needs
// the local app running (`cd apps/api && corepack pnpm exec wrangler dev --port 8787`, after building the web)
// and the local accounts below (sign up once through /dev/google). It is not part of CI.
//
//   PLAYWRIGHT_PATH=/path/to/playwright/index.mjs node scripts/ui/contrast.mjs <output-dir> [base-url] [--all]
//
// For each text it reads the computed text color and finds the background by laying every background color of
// the element and its parents on top of each other until one is solid. `--all` prints every measured text, not
// only the failures. A few texts are also checked against the pixels of a screenshot. Sending is answered by a
// stand-in response, so the local database and the send limit are left alone. Exits 1 when any text fails.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PLAYWRIGHT =
  process.env.PLAYWRIGHT_PATH ?? "/Users/tamanh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
const { chromium } = await import(pathToFileURL(path.resolve(PLAYWRIGHT)).href);

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ALL = process.argv.includes("--all");
const OUT = path.resolve(args[0] ?? "contrast-out");
const BASE = args[1] ?? "http://localhost:8787";
const PEOPLE = [
  { email: "lan.teacher@example.com", name: "Lan Teacher", lang: "en" },
  { email: "mai.student@example.com", name: "Hoang Mai", lang: "vi" },
];
const SCHEMES = ["light", "dark"];
const VIEWPORT = { width: 1280, height: 900 };
mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------ measuring, inside the page

/** Runs in the browser: every visible text inside `scope` with its color, background and the ratio. */
function measure(scopeSelectors) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  // Colors come back as rgb(), oklch(), oklab() or color(srgb ...). The oklab/oklch ones are converted here;
  // anything else is drawn on a 1x1 canvas and read back.
  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  const clamp = (x) => Math.min(1, Math.max(0, x));
  function oklabToRgb(L, a, b) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map((c) => clamp(toGamma(c)));
  }
  const num = (v, scale = 1) => (v.endsWith("%") ? (parseFloat(v) / 100) * scale : parseFloat(v));
  function parse(str) {
    const m = str.match(/^(rgba?|oklch|oklab|color)\((.*)\)$/);
    if (m) {
      const [main, alphaPart] = m[2].split("/");
      let parts = main.trim().split(/[\s,]+/);
      const alpha = alphaPart !== undefined ? num(alphaPart.trim()) : parts.length === 4 ? num(parts[3]) : 1;
      if (m[1] === "rgb" || m[1] === "rgba")
        return { rgb: parts.slice(0, 3).map((p) => num(p, 255) / 255), alpha };
      if (m[1] === "oklab")
        return { rgb: oklabToRgb(num(parts[0]), num(parts[1], 0.4), num(parts[2], 0.4)), alpha };
      if (m[1] === "oklch") {
        const L = num(parts[0]);
        const C = num(parts[1], 0.4);
        const H = parts[2] === "none" ? 0 : (parseFloat(parts[2]) * Math.PI) / 180;
        return { rgb: oklabToRgb(L, C * Math.cos(H), C * Math.sin(H)), alpha };
      }
      if (m[1] === "color" && parts[0] === "srgb")
        return { rgb: parts.slice(1, 4).map((p) => clamp(num(p))), alpha };
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = str;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return { rgb: [r / 255, g / 255, b / 255], alpha: a / 255, viaCanvas: true };
  }
  const over = (top, alpha, under) => top.map((c, i) => c * alpha + under[i] * (1 - alpha));
  const luminance = (rgb) => {
    const [r, g, b] = rgb.map(toLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const hex = (rgb) =>
    "#" +
    rgb
      .map((c) =>
        Math.round(c * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");

  /** The solid color under an element: its own and every parent's background, laid on top of each other. */
  function background(el) {
    const layers = [];
    let images = false;
    let opacity = 1;
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== "none") images = true;
      opacity *= parseFloat(style.opacity);
      const c = parse(style.backgroundColor);
      if (c.alpha > 0) layers.push(c);
      if (c.alpha >= 0.999) break;
      // A dialog sits in the top layer above the backdrop: what is behind it in the page does not count.
      if (node.tagName === "DIALOG") break;
    }
    let rgb = parse(getComputedStyle(document.body).backgroundColor).rgb;
    for (const layer of layers.reverse()) rgb = over(layer.rgb, layer.alpha, rgb);
    return { rgb, images, opacity };
  }

  function path(el) {
    const bits = [];
    for (let node = el; node && node !== document.body && bits.length < 3; node = node.parentElement) {
      const cls = [...node.classList].slice(0, 3).join(".");
      bits.unshift(node.tagName.toLowerCase() + (cls ? "." + cls : ""));
    }
    return bits.join(" > ");
  }

  const results = [];
  function record(el, text, colorStr, kind) {
    const style = getComputedStyle(el);
    const fg = parse(colorStr);
    if (fg.alpha === 0) return; // transparent text (for example the hidden "close" button behind a dialog)
    const bg = background(el);
    const fgRgb = over(fg.rgb, fg.alpha, bg.rgb);
    const size = parseFloat(style.fontSize);
    const weight = parseInt(style.fontWeight, 10);
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const r = ratio(fgRgb, bg.rgb);
    results.push({
      path: path(el) + (kind ? ` ${kind}` : ""),
      text: text.replace(/\s+/g, " ").trim().slice(0, 60),
      fg: hex(fgRgb),
      bg: hex(bg.rgb),
      size,
      weight,
      ratio: Math.round(r * 100) / 100,
      need,
      ok: r >= need,
      note: [
        bg.images && "background image",
        bg.opacity < 1 && `opacity ${bg.opacity}`,
        fg.viaCanvas && "canvas",
      ]
        .filter(Boolean)
        .join(", "),
      id: el.dataset.contrastId || null,
    });
  }

  const scopes = scopeSelectors.flatMap((s) => [...document.querySelectorAll(s)]);
  const seen = new Set();
  for (const scope of scopes) {
    for (const el of [scope, ...scope.querySelectorAll("*")]) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue; // screen-reader-only text
      if (
        el.tagName === "TEXTAREA" ||
        (el.tagName === "INPUT" && !["checkbox", "radio", "hidden"].includes(el.type))
      ) {
        if (el.value) record(el, el.value, getComputedStyle(el).color, "(typed text)");
        else if (el.placeholder)
          record(el, el.placeholder, getComputedStyle(el, "::placeholder").color, "::placeholder");
        continue;
      }
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join("");
      if (own.trim()) record(el, own, getComputedStyle(el).color);
    }
  }
  return results;
}

/** Runs in the browser: the contrast of the darkest and lightest pixels in a screenshot of one element. */
async function pixels(dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rgbOf = (key) => [(key >> 16) & 255, (key >> 8) & 255, key & 255].map((c) => c / 255);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  const bgKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const bg = rgbOf(bgKey);
  let best = 1;
  let fg = bg;
  for (const key of counts.keys()) {
    const rgb = rgbOf(key);
    const [x, y] = [lum(rgb), lum(bg)].sort((p, q) => q - p);
    const r = (x + 0.05) / (y + 0.05);
    if (r > best) [best, fg] = [r, rgb];
  }
  const hex = (rgb) =>
    "#" +
    rgb
      .map((c) =>
        Math.round(c * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  return { bg: hex(bg), fg: hex(fg), ratio: Math.round(best * 100) / 100 };
}

// ------------------------------------------------------------------ driving the browser

const browser = await chromium.launch({ channel: "chrome" });
const sessions = new Map();
const failures = [];
const report = [];
const checks = [];

async function open(person, scheme) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: scheme,
    reducedMotion: "reduce",
    storageState: sessions.get(person.email),
  });
  const page = await context.newPage();
  if (!sessions.has(person.email)) {
    await page.goto(`${BASE}/api/auth/google/start?intent=sign-in&keep=1`);
    await page.waitForURL(/dev\/google/);
    await page.locator("input").nth(0).fill(person.email);
    await page.locator("input").nth(1).fill(person.name);
    await page.locator("button[type=submit]").click();
    await page.waitForTimeout(2500);
    sessions.set(person.email, await context.storageState());
  }
  await page.request.fetch(`${BASE}/api/me/language`, {
    method: "PUT",
    headers: { "x-lms-client": "web", "content-type": "application/json" },
    data: JSON.stringify({ language: person.lang }),
  });
  await context.addInitScript((l) => localStorage.setItem("lms.lang", l), person.lang);
  return { context, page };
}

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(400);
}

async function check(page, label, scopes) {
  await page.screenshot({ path: path.join(OUT, `${label}.png`), fullPage: true });
  const results = await page.evaluate(measure, scopes);
  for (const r of results) {
    const line = `${r.ok ? "ok  " : "FAIL"} ${r.ratio.toFixed(2).padStart(5)} (need ${r.need})  ${r.fg} on ${r.bg}  ${label}  ${r.path}  "${r.text}"${r.note ? `  [${r.note}]` : ""}`;
    if (!r.ok) failures.push(line);
    if (ALL || !r.ok) console.log(line);
    report.push({ label, ...r });
  }
  return results;
}

/** Compares the computed ratio of one element with the pixels of its screenshot. */
async function crossCheck(page, label, locator, name) {
  const el = locator.first();
  if (!(await el.count())) return;
  // A focus ring can reach into a neighbour's box and would be read as its text.
  await page.evaluate(() => document.activeElement?.blur());
  await el.evaluate((node) => (node.dataset.contrastId = "x"));
  const all = await page.evaluate(measure, ["[data-contrast-id=x]"]);
  await el.evaluate((node) => delete node.dataset.contrastId);
  const own = all.find((r) => r.id === "x") ?? all[0];
  const shot = await el.screenshot();
  const px = await page.evaluate(pixels, "data:image/png;base64," + shot.toString("base64"));
  const line = `${label}  ${name}: computed ${own?.ratio} (${own?.fg} on ${own?.bg}), pixels ${px.ratio} (${px.fg} on ${px.bg})`;
  checks.push(line);
  console.log("cross-check " + line);
}

const emptyBoard = { todo: [], inProgress: [], done: [] };

for (const person of PEOPLE) {
  for (const scheme of SCHEMES) {
    const tag = `${person.lang}-${scheme}`;
    const { context, page } = await open(person, scheme);

    // 1. The board with cards.
    await page.goto(`${BASE}/feedback`);
    await settle(page);
    await check(page, `${tag}-board`, ["body"]);
    await crossCheck(page, `${tag}-board`, page.locator("main header p"), "intro");
    await crossCheck(page, `${tag}-board`, page.locator("main li p.text-xs"), "card meta");
    await crossCheck(page, `${tag}-board`, page.locator("main h2 span"), "count chip");
    await crossCheck(page, `${tag}-board`, page.locator("main header button"), "send button");

    // 2. The board with every column empty.
    await page.route("**/api/feedback/board", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(emptyBoard) }),
    );
    await page.reload();
    await settle(page);
    await check(page, `${tag}-board-empty`, ["main"]);
    await page.unroute("**/api/feedback/board");
    await page.reload();
    await settle(page);

    // 3. The dialog: as opened, then with text typed and another kind chosen.
    const main = page.locator("main header").getByRole("button");
    await main.click();
    await page.waitForTimeout(400);
    await check(page, `${tag}-dialog`, ["dialog[open] .modal-box"]);
    await crossCheck(
      page,
      `${tag}-dialog`,
      page.locator("dialog[open] [aria-pressed=true]"),
      "selected kind",
    );
    await page.locator("dialog[open] [aria-pressed=false]").last().click();
    await page
      .locator("dialog[open] textarea")
      .fill("Đây là một góp ý thử để đo độ tương phản / A test message.");
    await page.waitForTimeout(200);
    await check(page, `${tag}-dialog-filled`, ["dialog[open] .modal-box"]);
    await crossCheck(page, `${tag}-dialog-filled`, page.locator("dialog[open] textarea + p"), "hint");

    // 4. Errors in the dialog: a message too short, then the server saying "too many".
    await page.locator("dialog[open] textarea").fill("ab");
    await page.locator("dialog[open] .modal-action button").last().click();
    await page.waitForTimeout(300);
    await page.route("**/api/feedback", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 429,
            contentType: "application/json",
            body: JSON.stringify({
              error: { code: "RATE_LIMITED", message: "Too many requests. Try again later." },
            }),
          })
        : route.continue(),
    );
    await check(page, `${tag}-dialog-field-error`, ["dialog[open] .modal-box"]);
    await page.locator("dialog[open] textarea").fill("A message that is long enough.");
    await page.locator("dialog[open] .modal-action button").last().click();
    await page.waitForTimeout(500);
    await check(page, `${tag}-dialog-form-error`, ["dialog[open] .modal-box"]);
    await page.unroute("**/api/feedback");

    // 5. The toast after sending (the send itself is answered here, nothing is saved).
    await page.route("**/api/feedback", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true }) })
        : route.continue(),
    );
    await page.locator("dialog[open] .modal-action button").last().click();
    await page.waitForTimeout(600);
    if (await page.locator("dialog[open]").count())
      failures.push(`${tag}: the dialog stayed open after sending`);
    await check(page, `${tag}-toast`, [".toast"]);
    await crossCheck(page, `${tag}-toast`, page.locator(".toast .alert span"), "toast text");
    await page.unroute("**/api/feedback");

    await context.close();
  }
}
await browser.close();

writeFileSync(path.join(OUT, "contrast.json"), JSON.stringify({ report, checks }, null, 2));
const failed = report.filter((r) => !r.ok);
console.log(`\n${report.length} texts measured, ${failed.length} below WCAG AA.`);
if (failures.length > failed.length) console.log(failures.filter((f) => !f.startsWith("FAIL")).join("\n"));
process.exitCode = failures.length ? 1 : 0;
