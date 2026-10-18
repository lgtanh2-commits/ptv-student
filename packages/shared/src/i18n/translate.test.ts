import { describe, expect, it } from "vitest";
import { parseLanguage, localeOf } from "./languages";
import { translate } from "./translate";
import type { ServerText } from "./languages";

const t = (id: string, vi: string, en = id): ServerText => ({ id, en, vi });

const TABLE: readonly ServerText[] = [
  t("Please sign in to continue.", "Vui lòng đăng nhập.", "Please sign in."),
  t("Question {i + 1}: please give points.", "Câu hỏi {i + 1}: vui lòng nhập điểm."),
  t("Question {i + 1}: ", "Câu hỏi {i + 1}: "),
  t("{n}please write the question.", "{n}vui lòng nhập câu hỏi."),
  t("New homework: {a.title}", "Bài tập mới: {a.title}"),
  t("Due soon: {a.title}", "Sắp đến hạn nộp: {a.title}"),
  t("Use only numbers, spaces and + ( ) - .", "Chỉ dùng số, dấu cách và + ( ) - ."),
];

describe("parseLanguage", () => {
  it("accepts only exact language codes", () => {
    expect(parseLanguage("vi")).toBe("vi");
    expect(parseLanguage("en")).toBe("en");
    expect(parseLanguage("VI")).toBeNull();
    expect(parseLanguage("__proto__")).toBeNull();
    expect(parseLanguage(5)).toBeNull();
  });
  it("maps a language to a locale", () => {
    expect(localeOf("vi")).toBe("vi-VN");
    expect(localeOf("en")).toBe("en-GB");
  });
});

describe("translate", () => {
  it("translates exact text", () => {
    expect(translate("Please sign in to continue.", "vi", TABLE)).toBe("Vui lòng đăng nhập.");
    expect(translate("Please sign in to continue.", "en", TABLE)).toBe("Please sign in.");
  });

  it("returns unknown text unchanged", () => {
    expect(translate("Something else", "vi", TABLE)).toBe("Something else");
  });

  it("fills placeholders from the matched text", () => {
    expect(translate("Question 3: please give points.", "vi", TABLE)).toBe("Câu hỏi 3: vui lòng nhập điểm.");
  });

  it("translates a capture named n again", () => {
    expect(translate("Question 2: please write the question.", "vi", TABLE)).toBe(
      "Câu hỏi 2: vui lòng nhập câu hỏi.",
    );
  });

  it("does not translate user content again", () => {
    expect(translate("New homework: Due soon: x", "vi", TABLE)).toBe("Bài tập mới: Due soon: x");
  });

  it("does not expand $ patterns or placeholders found in user content", () => {
    expect(translate("New homework: $& {a.title}", "vi", TABLE)).toBe("Bài tập mới: $& {a.title}");
  });

  it("treats regex characters in ids as literal", () => {
    const id = "Use only numbers, spaces and + ( ) - .";
    expect(translate(id, "vi", TABLE)).toBe("Chỉ dùng số, dấu cách và + ( ) - .");
    expect(translate("Use only numbers, spaces and + ( ) - X", "vi", TABLE)).toBe(
      "Use only numbers, spaces and + ( ) - X",
    );
  });

  it("is anchored", () => {
    expect(translate("Oops Please sign in to continue.", "vi", TABLE)).toBe(
      "Oops Please sign in to continue.",
    );
  });

  it("returns quickly for long input", () => {
    const long = "a".repeat(5000);
    const start = Date.now();
    expect(translate(long, "vi", TABLE)).toBe(long);
    expect(Date.now() - start).toBeLessThan(50);
  });
});
