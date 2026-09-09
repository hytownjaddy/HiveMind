import { describe, expect, it } from "vitest";

import { optionFlag, optionList, optionString, parseArgs } from "./args";

describe("parseArgs", () => {
  it("separates positionals, values, flags, and repeats", () => {
    const args = parseArgs([
      "work",
      "new",
      "lesson.update",
      "--lesson",
      "HM-LESSON-x-01",
      "--priority=high",
      "--label",
      "a",
      "--label",
      "b",
      "--dry-run",
      "--",
      "--literal",
    ]);
    expect(args.positionals).toEqual(["work", "new", "lesson.update", "--literal"]);
    expect(optionString(args, "lesson")).toBe("HM-LESSON-x-01");
    expect(optionString(args, "priority")).toBe("high");
    expect(optionList(args, "label")).toEqual(["a", "b"]);
    expect(optionFlag(args, "dry-run")).toBe(true);
    expect(optionFlag(args, "missing")).toBe(false);
    expect(optionString(args, "dry-run")).toBeUndefined();
  });
});
