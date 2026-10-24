import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = import.meta.dirname;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

const importsOf = (file: string) =>
  [...readFileSync(file, "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]!);

describe("frontend architecture (plan 5.2)", () => {
  it("features/ never imports ui/, pages/ or .vue files", () => {
    const bad = files(path.join(root, "features")).flatMap((f) =>
      importsOf(f)
        .filter((i) => /(^|\/)(ui|pages)(\/|$)/.test(i) || i.endsWith(".vue"))
        .map((i) => `${path.relative(root, f)} -> ${i}`),
    );
    expect(bad).toEqual([]);
  });

  it("pages/ and components/ do not use raw color values, only design tokens", () => {
    const bad = [...files(path.join(root, "pages")), ...files(path.join(root, "components"))]
      .filter((f) => f.endsWith(".vue"))
      .filter((f) => /#[0-9a-fA-F]{3,8}\b|\brgb\(|\bhsl\(/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(root, f));
    expect(bad).toEqual([]);
  });

  it("every App component that a screen uses is imported (a missing import shows as an empty gap, not as an error)", () => {
    const bad = files(root)
      .filter((f) => f.endsWith(".vue"))
      .flatMap((f) => {
        const text = readFileSync(f, "utf8");
        const script = /<script[\s\S]*?<\/script>/.exec(text)?.[0] ?? "";
        const template = text.replace(/<script[\s\S]*?<\/script>/, "");
        const self = path.basename(f, ".vue");
        return [...new Set([...template.matchAll(/<(App[A-Z][A-Za-z]*)[\s>/]/g)].map((m) => m[1]!))]
          .filter((name) => name !== self && !new RegExp(`import ${name}(,| from)`).test(script))
          .map((name) => `${path.relative(root, f)}: ${name}`);
      });
    expect(bad).toEqual([]);
  });

  // The buttons of the page itself: a slot named "actions" that is a direct child of the page (four spaces in).
  // Status badges and due text go in the "meta" slot, rarer actions in the "more" slot (a "⋯" menu); neither counts here.
  const pageActions = () =>
    files(path.join(root, "pages"))
      .filter((f) => f.endsWith(".vue"))
      .flatMap((f) => {
        const template = readFileSync(f, "utf8").replace(/<script[\s\S]*?<\/script>/, "");
        return [...template.matchAll(/\n {4}<template[^>]*#actions>([\s\S]*?)\n {4}<\/template>/g)].map(
          (m) => ({
            file: path.relative(root, f),
            body: m[1]!,
            // A control with v-else takes the place of the one before it, so it is never shown with it.
            controls: [...m[1]!.matchAll(/<(AppButton|RouterLink|button|a)\b[^>]*>/g)].map((c) => c[0]),
          }),
        );
      });

  it("in the buttons at the top of a page, the main button is always the last one (the far right)", () => {
    const bad = pageActions().flatMap(({ file, controls }) => {
      const isMain = (tag: string) =>
        tag.startsWith("<AppButton") ? !/variant/.test(tag) : /btn-primary/.test(tag);
      const last = controls.at(-1);
      const hasMain = controls.some(isMain);
      return hasMain && last && !isMain(last) ? [`${file}: ${last}`] : [];
    });
    expect(bad).toEqual([]);
  });

  it('the top of a page shows at most 2 buttons (more go in the "⋯" menu) and no badges (they go under the title)', () => {
    const bad = pageActions().flatMap(({ file, body, controls }) => [
      ...(controls.filter((c) => !/\sv-else\b/.test(c)).length > 2 ? [`${file}: more than 2 buttons`] : []),
      ...(/<AppBadge\b/.test(body) ? [`${file}: AppBadge in #actions (use #meta)`] : []),
      ...(/<(div|span|p)\b/.test(body)
        ? [`${file}: text or a group in #actions (use #meta, or move it into the page)`]
        : []),
    ]);
    expect(bad).toEqual([]);
  });

  const screenTemplates = () =>
    [...files(path.join(root, "pages")), ...files(path.join(root, "components"))]
      .filter((f) => f.endsWith(".vue"))
      .map((f) => ({
        file: path.relative(root, f),
        template: readFileSync(f, "utf8").replace(/<script[\s\S]*?<\/script>/, ""),
      }));

  it("a form's submit button sits in AppFormActions (full width on a phone), a dialog footer, or is full width itself", () => {
    const bad = screenTemplates().flatMap(({ file, template }) =>
      [
        ...template
          .replace(/<AppFormActions\b[\s\S]*?<\/AppFormActions>/g, "")
          .replace(/<template #actions>[\s\S]*?<\/template>/g, "")
          .matchAll(/<AppButton\b[^>]*\stype="submit"[^>]*>/g),
      ]
        .filter((m) => !/\sblock\b/.test(m[0]))
        .map((m) => `${file}: ${m[0].replace(/\s+/g, " ")}`),
    );
    expect(bad).toEqual([]);
  });

  it("in AppFormActions the main button is the last one in the markup (on top on a phone, far right on a wide screen)", () => {
    const bad = screenTemplates().flatMap(({ file, template }) =>
      [...template.matchAll(/<AppFormActions\b[^>]*>([\s\S]*?)<\/AppFormActions>/g)].flatMap((m) => {
        const buttons = [...m[1]!.matchAll(/<AppButton\b[^>]*>/g)].map((b) => b[0]);
        const isMain = (tag: string) => !/\svariant=/.test(tag) || /variant="danger"/.test(tag);
        const last = buttons.at(-1);
        return buttons.some(isMain) && last && !isMain(last) ? [`${file}: ${last.replace(/\s+/g, " ")}`] : [];
      }),
    );
    expect(bad).toEqual([]);
  });

  it("in a dialog footer the main button is the last one in the markup (on top in the phone's bottom sheet, far right on a wide screen)", () => {
    const bad = screenTemplates().flatMap(({ file, template }) =>
      [...template.matchAll(/<AppModal\b[\s\S]*?<\/AppModal>/g)].flatMap((modal) => {
        const footer = modal[0].split("<template #actions>")[1] ?? "";
        const controls = [...footer.matchAll(/<(AppButton|RouterLink)\b[^>]*>/g)].map((b) => b[0]);
        const isMain = (tag: string) =>
          tag.startsWith("<AppButton")
            ? !/\svariant=/.test(tag) || /variant="danger"/.test(tag)
            : /btn-primary/.test(tag);
        const last = controls.at(-1);
        return controls.some(isMain) && last && !isMain(last)
          ? [`${file}: ${last.replace(/\s+/g, " ")}`]
          : [];
      }),
    );
    expect(bad).toEqual([]);
  });

  it("a bar stuck to the bottom of a page is an AppActionBar (full-width button on a phone, safe-area padding)", () => {
    const bad = screenTemplates()
      .filter(({ template }) => /\bsticky\b[^"]*\bbottom-0\b|\bbottom-0\b[^"]*\bsticky\b/.test(template))
      .map(({ file }) => file);
    expect(bad).toEqual([]);
  });

  it("a regular button is never alone in a bare <div> (that strands it on the left at its natural width on a phone)", () => {
    const bad = screenTemplates().flatMap(({ file, template }) =>
      [...template.matchAll(/<div>\s*(<AppButton\b[^>]*>)[\s\S]*?<\/AppButton\s*>\s*<\/div>/g)]
        .filter((m) => !/\scompact\b/.test(m[1]!))
        .map((m) => `${file}: ${m[1]!.replace(/\s+/g, " ")}`),
    );
    expect(bad).toEqual([]);
  });

  it("a list row is an AppListRow: no wrapping row with basis-* text columns (that drops a badge onto its own line at the left)", () => {
    const bad = screenTemplates()
      .filter(({ template }) => /\bbasis-(\d|\[)/.test(template))
      .map(({ file }) => file);
    expect(bad).toEqual([]);
  });

  it("an icon-only button says what it does (label: read by screen readers, shown on hover)", () => {
    const bad = screenTemplates().flatMap(({ file, template }) =>
      [...template.matchAll(/<AppButton\b[^>]*>/g)]
        .filter((m) => /\sicon=/.test(m[0]) && !/\s:?label=/.test(m[0]))
        .map((m) => `${file}: ${m[0].replace(/\s+/g, " ")}`),
    );
    expect(bad).toEqual([]);
  });

  it("every table has pages (ten rows on a page), except the lines of a receipt, which is one document", () => {
    const bad = [...files(path.join(root, "pages")), ...files(path.join(root, "components"))]
      .filter((f) => f.endsWith(".vue") && !f.endsWith("InvoiceSheet.vue"))
      .filter((f) => {
        const text = readFileSync(f, "utf8");
        return text.includes("<AppDataList") && !text.includes("<AppPager");
      })
      .map((f) => path.relative(root, f));
    expect(bad).toEqual([]);
  });

  it("a table is an AppDataList (stacked rows on a phone, a table from sm), never a bare AppTable that scrolls sideways", () => {
    const bad = [...files(path.join(root, "pages")), ...files(path.join(root, "components"))]
      .filter((f) => f.endsWith(".vue"))
      .filter((f) => /<AppTable\b|<table\b/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(root, f));
    expect(bad).toEqual([]);
  });

  it("number tiles are laid out by AppStatGroup (equal heights, compact on a phone, money as one card of rows)", () => {
    const bad = [...files(path.join(root, "pages")), ...files(path.join(root, "components"))]
      .filter((f) => f.endsWith(".vue"))
      .filter((f) => /<AppStat\b/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(root, f));
    expect(bad).toEqual([]);
  });

  it("no screen uses an inline style (the page security policy blocks them): use classes", () => {
    const bad = files(root)
      .filter((f) => f.endsWith(".vue"))
      .filter((f) => /\sstyle="/.test(readFileSync(f, "utf8").replace(/<script[\s\S]*?<\/script>/, "")))
      .map((f) => path.relative(root, f));
    expect(bad).toEqual([]);
  });

  it("pages and components do not hard-code text: they read from the message catalog", () => {
    const bad = [...files(path.join(root, "pages")), ...files(path.join(root, "components"))]
      .filter((f) => f.endsWith(".vue"))
      .filter((f) =>
        />\s*[A-Z][a-z]+ [a-z]+[^<{]*</.test(
          readFileSync(f, "utf8").replace(/<script[\s\S]*?<\/script>/, ""),
        ),
      )
      .map((f) => path.relative(root, f));
    expect(bad).toEqual([]);
  });
});
