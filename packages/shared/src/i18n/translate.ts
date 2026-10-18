import type { Language, ServerText } from "./languages";
import { SERVER_TEXT } from "./server-text";

interface Pattern {
  re: RegExp;
  names: string[];
  entry: ServerText;
  literalLength: number;
}

interface Compiled {
  exact: Map<string, ServerText>;
  patterns: Pattern[];
}

// Longer inputs are never matched, so a huge string cannot make us do a lot of work.
const MAX_INPUT = 2000;
// How many times a capture named "n" may be translated again.
const MAX_DEPTH = 2;

const compiledByTable = new WeakMap<readonly ServerText[], Compiled>();

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compile(table: readonly ServerText[]): Compiled {
  const exact = new Map<string, ServerText>();
  const patterns: Pattern[] = [];
  for (const entry of table) {
    if (!entry.id.includes("{")) {
      if (!exact.has(entry.id)) exact.set(entry.id, entry);
      continue;
    }
    const names: string[] = [];
    let source = "";
    let literalLength = 0;
    let last = 0;
    for (const m of entry.id.matchAll(/\{([^{}]*)\}/g)) {
      const literal = entry.id.slice(last, m.index);
      literalLength += literal.length;
      source += escapeRegex(literal) + "([\\s\\S]*?)";
      names.push(m[1]!);
      last = m.index + m[0].length;
    }
    const tail = entry.id.slice(last);
    literalLength += tail.length;
    source += escapeRegex(tail);
    // A pattern with no fixed text would match everything.
    if (literalLength === 0) continue;
    patterns.push({ re: new RegExp(`^${source}$`), names, entry, literalLength });
  }
  patterns.sort((a, b) => b.literalLength - a.literalLength);
  return { exact, patterns };
}

function lookup(text: string, lang: Language, table: readonly ServerText[], depth: number): string {
  if (text.length > MAX_INPUT) return text;
  let compiled = compiledByTable.get(table);
  if (!compiled) {
    compiled = compile(table);
    compiledByTable.set(table, compiled);
  }
  const hit = compiled.exact.get(text);
  if (hit) return hit[lang];

  for (const p of compiled.patterns) {
    const m = p.re.exec(text);
    if (!m) continue;
    const values = new Map<string, string>();
    p.names.forEach((name, i) => {
      if (values.has(name)) return;
      const raw = m[i + 1]!;
      // Only "n" is our own text; every other capture is user content, inserted as it is.
      values.set(name, name === "n" && depth < MAX_DEPTH ? lookup(raw, lang, table, depth + 1) : raw);
    });
    // One pass with a function replacer, so inserted content is never expanded again.
    return p.entry[lang].replace(/\{([^{}]*)\}/g, (whole, name: string) => values.get(name) ?? whole);
  }
  return text;
}

/** Replace finished English text with the table's text for `lang`. Unknown text is returned unchanged. */
export function translate(text: string, lang: Language, table: readonly ServerText[] = SERVER_TEXT): string {
  return lookup(text, lang, table, 0);
}
