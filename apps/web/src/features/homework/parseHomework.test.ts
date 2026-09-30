import { describe, expect, it } from "vitest";
import { parseHomeworkText } from "./parseHomework";
import { SAMPLE_HOMEWORK_TEXT } from "./sample";

describe("parseHomeworkText", () => {
  it("reads the sample file as 4 questions, one of each kind, with no review needed", () => {
    const qs = parseHomeworkText(SAMPLE_HOMEWORK_TEXT);
    expect(qs.map((q) => q.kind)).toEqual(["choice", "short", "written", "speaking"]);
    expect(qs.every((q) => !q.review)).toBe(true);
  });

  it("reads a multiple choice question, the correct answer marked with a star", () => {
    const [q] = parseHomeworkText(
      "1. What is the capital of Vietnam? (2 points)\nA. Ho Chi Minh City\nB. Hanoi *\nC. Hue",
    );
    expect(q).toMatchObject({
      kind: "choice",
      text: "What is the capital of Vietnam?",
      points: "2",
      options: ["Ho Chi Minh City", "Hanoi", "Hue"],
      correct: 1,
    });
  });

  it("also reads the correct answer from an Answer: line with a letter", () => {
    const [q] = parseHomeworkText("1. Pick one\nA. No\nB. Yes\nAnswer: B");
    expect(q!.correct).toBe(1);
  });

  it("flags it for a check when two answers are marked correct", () => {
    const [q] = parseHomeworkText("1. Pick one\nA. No *\nB. Yes *");
    expect(q!.review).toBeTruthy();
  });

  it("reads a short answer question from an Answer: line with no lettered options", () => {
    const [q] = parseHomeworkText("2. 5 + 3 = ?\nAnswer: 8, eight");
    expect(q).toMatchObject({ kind: "short", text: "5 + 3 = ?", points: "1", accepted: ["8", "eight"] });
  });

  it("reads writing and speaking questions from their tag, in English or Vietnamese", () => {
    const [essay, speaking, tuLuan, noi] = parseHomeworkText(
      [
        "3. [Essay] Write about your day. (5 points)",
        "",
        "4. [Speaking] Say your name.",
        "",
        "5. [Tự luận] Viết về gia đình bạn.",
        "",
        "6. [Nói] Giới thiệu bản thân.",
      ].join("\n"),
    );
    expect(essay).toMatchObject({ kind: "written", points: "5" });
    expect(speaking).toMatchObject({ kind: "speaking", points: "5" });
    expect(tuLuan).toMatchObject({ kind: "written" });
    expect(noi).toMatchObject({ kind: "speaking" });
  });

  it("defaults to writing and asks for a check when the kind cannot be told", () => {
    const [q] = parseHomeworkText("1. Just some text with nothing to tell its kind.");
    expect(q).toMatchObject({ kind: "written" });
    expect(q!.review).toBeTruthy();
  });

  it("drops the leading number, accepting both '1.' and '1)'", () => {
    const qs = parseHomeworkText("1. First\nA. a\nB. b\n\n2) Second\nA. a\nB. b");
    expect(qs.map((q) => q.text)).toEqual(["First", "Second"]);
  });

  it("handles a BOM, windows line ends and extra blank lines between questions", () => {
    const qs = parseHomeworkText("﻿1. First\r\nA. a\r\nB. b\r\n\r\n\r\n2. Second\r\nA. a\r\nB. b\r\n");
    expect(qs.length).toBe(2);
  });

  it("returns nothing for empty text", () => {
    expect(parseHomeworkText("   \n\n  ")).toEqual([]);
  });
});
