// Lists the English texts in the API and shared code that a person can read (errors, form messages, emails,
// notifications, Telegram replies). Each text is written the way the translation table stores it: a template
// literal `Hi ${name},` becomes "Hi {name},". Prints `{ id, where[], group }[]` as JSON.
//
//   node scripts/i18n/scan-server.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ts = createRequire(path.join(ROOT, "apps/web/package.json"))("typescript");

const DIRS = ["apps/api/src", "packages/shared/src"];
// Tests, database statements (repos) and the i18n table itself hold no text of their own. Nor does
// lib/outbound-text.ts: it only lists table ids (copies of texts made elsewhere). Nor does feedback/telegram.ts:
// the owner's Vietnamese-only Telegram message.
const SKIP_FILES =
  /\.test\.ts$|\/repos\/|glossary\.ts$|\/i18n\/|lib\/outbound-text\.ts$|feedback\/telegram\.ts$/;
// Files with only technical strings: route lists, SMTP, health check, time zones, repeat rules.
const DROP_FILES =
  /routes\/access\.ts$|smtp-client\.ts$|app\.ts$|routes\/health\.ts$|apps\/api\/src\/index\.ts$|lessons\/repeat\.ts$|lib\/zone\.ts$|shared\/src\/domain\.ts$/;
const DROP_TEXT =
  /:ip:|:email:|:user:|^@lms\/|^__Host|^google-flow|^en-(GB|US)$|^Asia\/|^every_2_weeks$|^\{appUrl|^\/|^\{base\}/;
const SKIP_CALLEE =
  /(^|\.)(prepare|log|warn|error|info|debug|header|get|set|startsWith|endsWith|includes|split|replace|match|test|fetch|encode|decode|digest|importKey|sign|verify|getRandomValues|append|has|delete|describe|it|expect)$|console\.|logger|^require$|^import$|^Error$|^TypeError$/;
const SKIP_PROP =
  /^(action|kind|type|method|path|status|code|role|scope|target_?[tT]ype|msg|name|key|id|sql|headers?|contentType|content-type|alg|tag|mode|format|encoding|algorithm|hash|cache|redirect|credentials|sameSite|domain|dedupe)$/;

// Short texts the word filter would miss.
const ALWAYS = new Set([
  "Hi {name},",
  "Hi {studentName},",
  "Hello {current.student_name},",
  "Question {i + 1}: ",
  "{lesson.course_name} · now {body.date} {body.startTime}",
]);
// Texts built inside SQL statements (joined with ||), so they are not one string literal in the code.
const IN_SQL = [
  { file: "apps/api/src/repos/notifications.ts", id: "{s.name} handed in work" },
  { file: "apps/api/src/repos/notifications.ts", id: "New homework: " },
  { file: "apps/api/src/repos/notifications.ts", id: "Due soon: " },
];

const GROUPS = {
  errors: "30 Máy chủ - thông báo lỗi chung",
  forms: "31 Máy chủ - lỗi khi điền form",
  email: "32 Email",
  notify: "33 Thông báo (chuông & Telegram)",
  action: "34 Máy chủ - lỗi khi thao tác",
};

/** The parts of an id outside its `{…}` placeholders. */
export const literalParts = (id) => id.split(/\{[^{}]*\}/).filter((p) => p !== "");

function codeFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".ts")) out.push(full);
    }
  };
  for (const d of DIRS) walk(path.join(root, d));
  return out;
}

/** Source files a table id may come from (no tests, no generated table). */
export const sourceFiles = (root = ROOT) =>
  codeFiles(root).filter((f) => !/\.test\.ts$/.test(f) && !f.endsWith(path.join("i18n", "server-text.ts")));

const short = (rel) => rel.replace("apps/api/src/", "api/").replace("packages/shared/src/", "shared/");

function group(rel, prop, holder) {
  if (rel.endsWith("shared/src/errors.ts")) return GROUPS.errors;
  if (rel.endsWith("shared/src/schemas.ts")) return GROUPS.forms;
  if (rel.includes("email/templates.ts")) return GROUPS.email;
  if (rel.includes("telegram/service.ts")) return GROUPS.notify;
  if (rel.includes("repos/notifications.ts") || prop === "title" || prop === "prefix" || prop === "body")
    return GROUPS.notify;
  if (prop === "subject" || holder === "text") return GROUPS.email;
  return GROUPS.action;
}

function scanFile(full, rel) {
  const src = ts.createSourceFile(full, readFileSync(full, "utf8"), ts.ScriptTarget.Latest, true);
  const found = [];
  const callee = (node) => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isCallExpression(p) || ts.isNewExpression(p)) return p.expression.getText();
      if (ts.isFunctionLike(p)) return "";
    }
    return "";
  };
  // The property a literal is the direct value of (`title: "..."`).
  const propName = (node) => {
    const p = node.parent;
    return p && ts.isPropertyAssignment(p) && p.initializer === node ? p.name.getText() : "";
  };
  // For a line of an email body (`text: ["...", "..."].join("\n")`), the property holding the lines.
  const holderName = (node) => {
    let child = node.parent;
    if (!child || !ts.isArrayLiteralExpression(child)) return "";
    let p = child.parent;
    if (
      p &&
      ts.isPropertyAccessExpression(p) &&
      p.expression === child &&
      p.parent &&
      ts.isCallExpression(p.parent)
    ) {
      child = p.parent;
      p = child.parent;
    }
    return p && ts.isPropertyAssignment(p) && p.initializer === child ? p.name.getText() : "";
  };
  const visit = (node) => {
    let text = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
    else if (ts.isTemplateExpression(node)) {
      text =
        node.head.text +
        node.templateSpans.map((s) => `{${s.expression.getText()}}` + s.literal.text).join("");
    }
    if (text !== null && !ts.isImportDeclaration(node.parent) && !ts.isExportDeclaration(node.parent)) {
      const prop = propName(node);
      const words = text.replace(/\{[^}]*\}/g, "").match(/[A-Za-zÀ-ỹ]{2,}/g) ?? [];
      const looksLikeText =
        words.length >= 2 &&
        /[a-zà-ỹ]/.test(text) &&
        !/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE)\b/i.test(text) &&
        !SKIP_CALLEE.test(callee(node)) &&
        !SKIP_PROP.test(prop) &&
        !/^[a-z_.:/-]+$/.test(text) &&
        !/^https?:\/\//.test(text) &&
        !DROP_TEXT.test(text);
      if (ALWAYS.has(text) || looksLikeText) {
        const { line } = src.getLineAndCharacterOfPosition(node.getStart());
        found.push({
          id: text,
          where: `${short(rel)}:${line + 1}`,
          group: group(rel, prop, holderName(node)),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return found;
}

/** Every server text with the places it is used, one entry per distinct text, in a stable order. */
export function scanServer(root = ROOT) {
  const items = [];
  for (const full of codeFiles(root)) {
    const rel = path.relative(root, full).split(path.sep).join("/");
    if (SKIP_FILES.test(rel) || DROP_FILES.test(rel)) continue;
    items.push(...scanFile(full, rel));
  }
  for (const { file, id } of IN_SQL) {
    const text = readFileSync(path.join(root, file), "utf8");
    // The SQL string literal ('New homework: '), so a comment with the same words does not count.
    const at = text.indexOf(`'${literalParts(id)[0]}'`);
    if (at < 0) continue; // the text is gone from the code: nothing to list
    const line = text.slice(0, at).split("\n").length;
    items.push({ id, where: `${short(file)}:${line}`, group: GROUPS.notify });
  }
  const byId = new Map();
  for (const o of items) {
    const cur = byId.get(o.id);
    if (cur) {
      cur.where.push(o.where);
      if (o.group < cur.group) cur.group = o.group;
    } else byId.set(o.id, { id: o.id, where: [o.where], group: o.group });
  }
  return [...byId.values()].sort((a, b) => a.group.localeCompare(b.group));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(JSON.stringify(scanServer(), null, 1) + "\n");
}
