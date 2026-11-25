import { describe, it, expect } from "vitest";
import { reference, rupees, stageClosed } from "../src/modules/camps/budget-rules";
// Stage windows, reference figures and exact rupee parsing for camp budgets.
describe("camp budget stages", () => {
  const none = { sanctioned: {}, open: {} };
  it("initial before the camp starts", () => {
    expect(stageClosed("INITIAL", "UPCOMING", none)).toBeNull();
    expect(stageClosed("INITIAL", "CURRENT", none)).toBe("The initial budget is prepared before the camp starts.");
    expect(stageClosed("INITIAL", "COMPLETED", none)).toBe("The initial budget is prepared before the camp starts.");
    expect(stageClosed("INITIAL", "CANCELLED", none)).toBe("This camp is cancelled.");
  });
  it("revised before the end: after a sanctioned initial, or once started without one", () => {
    expect(stageClosed("REVISED", "UPCOMING", { sanctioned: { INITIAL: true }, open: {} })).toBeNull();
    expect(stageClosed("REVISED", "UPCOMING", none)).toBe("Prepare the initial budget first; a revised one follows its sanction.");
    expect(stageClosed("REVISED", "CURRENT", none)).toBeNull();
    expect(stageClosed("REVISED", "CURRENT", { sanctioned: {}, open: { INITIAL: true } })).toBe("Wait for the initial budget to be decided.");
    expect(stageClosed("REVISED", "COMPLETED", { sanctioned: { INITIAL: true }, open: {} })).toBe("A revised budget is prepared before the camp ends.");
  });
  it("final after the camp ends, whatever came before", () => {
    expect(stageClosed("FINAL", "COMPLETED", none)).toBeNull();
    expect(stageClosed("FINAL", "CURRENT", { sanctioned: { INITIAL: true }, open: {} })).toBe("The final budget is prepared after the camp ends.");
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
