import { test } from "node:test";
import assert from "node:assert/strict";
import { shiftDay, monthCells } from "../public/core/interface.js";
test("calendar crosses leap days, years, and DST without UTC date shifts", () => {
  for (const tz of ["Asia/Tokyo", "America/New_York", "Europe/London"]) {
    const old = process.env.TZ;
    process.env.TZ = tz;
    try {
      for (const [day, offset, expected] of [
        ["2024-02-28", 1, "2024-02-29"],
        ["2024-03-01", -1, "2024-02-29"],
        ["2025-12-31", 1, "2026-01-01"],
        ["2026-03-08", 1, "2026-03-09"],
        ["2026-11-01", -1, "2026-10-31"],
      ])
        assert.equal(shiftDay(day, offset), expected);
    } finally {
      if (old === undefined) delete process.env.TZ;
      else process.env.TZ = old;
    }
  }
});
test("calendar month starts on the correct weekday and has the correct day count", () => {
  assert.equal(monthCells("2024-02").filter(Boolean).length, 29);
  assert.equal(monthCells("2025-02").filter(Boolean).length, 28);
  assert.equal(monthCells("2024-02").indexOf("2024-02-01"), 4);
  assert.equal(monthCells("2026-09").at(-1), "2026-09-30");
});
