/** A space that never breaks the line: a value and its unit stay together. */
export const NBSP = " ";

/**
 * Fills {name} places in a message: fill("{n} students", { n: 3 }) gives "3 students".
 * A number is joined to the word after it with a no-break space, so "2 points" never splits.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}( (?=\S))?/g, (_, key: string, space?: string) => {
    const value = values[key];
    const gap = space ? (typeof value === "number" ? NBSP : " ") : "";
    return `${value ?? ""}${gap}`;
  });
}
