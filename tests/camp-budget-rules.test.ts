import { describe, it, expect } from "vitest";
import { reference, rupees, stageClosed } from "../src/modules/camps/budget-rules";
// Stage windows, reference figures and exact rupee parsing for camp budgets.
describe("camp budget stages", () => {
  it("initial until the camp ends", () => {
    expect(stageClosed("INITIAL", "UPCOMING", {})).toBeNull();
    expect(stageClosed("INITIAL", "CURRENT", {})).toBeNull();
    expect(stageClosed("INITIAL", "COMPLETED", {})).toBe("The initial budget is prepared before the camp ends.");
    expect(stageClosed("INITIAL", "CANCELLED", {})).toBe("This camp is cancelled.");
  });
  it("revised only while running, final only after, both after the initial is sanctioned", () => {
    expect(stageClosed("REVISED", "CURRENT", {})).toBe("The initial budget must be sanctioned first.");
    expect(stageClosed("REVISED", "CURRENT", { INITIAL: true })).toBeNull();
    expect(stageClosed("REVISED", "UPCOMING", { INITIAL: true })).toBe("A revised budget is prepared while the camp is running.");
    expect(stageClosed("FINAL", "CURRENT", { INITIAL: true })).toBe("The final budget is prepared after the camp ends.");
    expect(stageClosed("FINAL", "COMPLETED", { INITIAL: true })).toBeNull();
    expect(stageClosed("FINAL", "COMPLETED", {})).toBe("The initial budget must be sanctioned first.");
  });
});
describe("reference figures", () => {
  const basis = { cadets: 300, anos: 10, staff: 6, days: 10, litres: 200 };
  it("multiplies the right basis by the rate", () => {
    expect(reference("CADET_MESSING", basis, 15000n)).toBe(3000n * 15000n);
    expect(reference("ANO_DA", basis, 50000n)).toBe(100n * 50000n);
    expect(reference("STAFF_DA", basis, 40000n)).toBe(60n * 40000n);
    expect(reference("FUEL_DIESEL", basis, 9000n)).toBe(200n * 9000n);
  });
  it("has none for typed heads or without a rate", () => {
    expect(reference("BUS_FARE", basis, 100n)).toBeNull();
    expect(reference("CADET_MESSING", basis, undefined)).toBeNull();
  });
});
describe("rupees", () => {
  it("parses exactly, empty as zero, and refuses bad input", () => {
    expect(rupees.parse("1500.5")).toBe(150050n);
    expect(rupees.parse("0.07")).toBe(7n);
    expect(rupees.parse("")).toBe(0n);
    expect(() => rupees.parse("12.345")).toThrow();
    expect(() => rupees.parse("-5")).toThrow();
  });
});
