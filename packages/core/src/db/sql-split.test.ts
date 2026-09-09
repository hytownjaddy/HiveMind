import { describe, expect, it } from "vitest";

import { inlineBindings } from "./recording";
import { splitSqlStatements } from "./sql-split";

describe("splitSqlStatements", () => {
  it("keeps triggers whole and drops comments", () => {
    const sql = `-- header
CREATE TABLE a (id TEXT);
CREATE TRIGGER t BEFORE DELETE ON a
BEGIN
    SELECT RAISE(ABORT, 'no; never');
END;
INSERT INTO a VALUES ('x');
`;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(3);
    expect(statements[1]).toContain("RAISE(ABORT, 'no; never')");
    expect(statements[2]).toBe("INSERT INTO a VALUES ('x')");
  });
});

describe("inlineBindings", () => {
  it("escapes strings and renders null, numbers, booleans", () => {
    expect(
      inlineBindings("INSERT INTO t VALUES (?, ?, ?, ?)", ["it's", 3, null, true]),
    ).toBe("INSERT INTO t VALUES ('it''s', 3, NULL, 1)");
    expect(() => inlineBindings("SELECT ?", [])).toThrow(/placeholders/u);
  });
});
