import { describe, it, expect } from "vitest";
import type { Assignment } from "../src/server/authorization";
import { istDate } from "../src/modules/platform/training-year";
import { checkNotice, tdHalfDays, tdStartIndex } from "../src/modules/movement/rules";
// TD day count, notice and where the chain starts. Day count and notice are
// development defaults, not NCC policy.
const post = (appointmentCode: string, level: string, role: string, capabilities: string[] = []): Assignment => ({
  role, level, appointmentCode, capabilities,
  anchor: { institutionId: null, unitId: level === "UNIT" ? "unit-1" : null, groupId: level === "DIRECTORATE" ? null : "group-1", directorateId: "dte-up" },
});
const AO = post("AO", "UNIT", "CO");
const DGC = post("DGC", "GROUP", "GROUP_STAFF");
const GP_CDR = post("GP_CDR", "GROUP", "GROUP");
const BRANCH = post("BR_PNC", "DIRECTORATE", "DTE_STAFF", ["movement"]);
const DIR = post("DIR", "DIRECTORATE", "DTE_STAFF");
const DDG = post("DDG", "DIRECTORATE", "ADMIN");
const ADG = post("ADG", "DIRECTORATE", "ADMIN");
const AD_ADM = post("AD_ADM", "DIRECTORATE", "DTE_STAFF");
const d = (date: string, half: "FN" | "AN") => ({ date, half });
describe("TD day count", () => {
  it("counts both dates, halving an afternoon start and a forenoon return", () => {
    expect(tdHalfDays(d("2026-12-03", "FN"), d("2026-12-05", "AN"))).toBe(6);
    expect(tdHalfDays(d("2026-12-03", "AN"), d("2026-12-05", "FN"))).toBe(4);
    expect(tdHalfDays(d("2026-12-03", "FN"), d("2026-12-03", "AN"))).toBe(2);
    expect(tdHalfDays(d("2026-12-03", "FN"), d("2026-12-03", "FN"))).toBe(1);
  });
  it("refuses a return before the start", () => {
    expect(() => tdHalfDays(d("2026-12-03", "AN"), d("2026-12-03", "FN"))).toThrow("The return must be after the start.");
    expect(() => tdHalfDays(d("2026-12-05", "FN"), d("2026-12-03", "AN"))).toThrow("The return must be after the start.");
  });
});
describe("TD notice", () => {
  it("needs the start at least 2 days after today", () => {
    expect(() => checkNotice("2026-12-03", "2026-12-01")).not.toThrow();
    expect(() => checkNotice("2026-12-02", "2026-12-01")).toThrow("Request temporary duty at least 2 days ahead.");
  });
  it("takes today as the Indian date late in the evening", () => {
    // 23:30 IST on 1 December is 18:00 UTC.
    const today = istDate(new Date("2026-12-01T18:00:00Z"));
    expect(() => checkNotice("2026-12-03", today)).not.toThrow();
    expect(() => checkNotice("2026-12-02", today)).toThrow();
  });
});
describe("where the chain starts", () => {
  it("starts one step above the more senior of creator and traveller", () => {
    expect(tdStartIndex([AO], [AO], "UNIT")).toBe(0);
    expect(tdStartIndex([DGC], [AO], "UNIT")).toBe(0);
    expect(tdStartIndex([GP_CDR], [GP_CDR], "GROUP")).toBe(1);
    expect(tdStartIndex([BRANCH], [BRANCH], "DIRECTORATE")).toBe(2);
    expect(tdStartIndex([DIR], [DIR], "DIRECTORATE")).toBe(3);
    expect(tdStartIndex([DDG], [DDG], "DIRECTORATE")).toBe(4);
    expect(tdStartIndex([DGC], [GP_CDR], "GROUP")).toBe(1);
    expect(tdStartIndex([DDG], [ADG], "DIRECTORATE")).toBe(5);
  });
  it("skips the Gp Cdr for directorate travellers and counts typed-in people as level 0", () => {
    expect(tdStartIndex([AD_ADM], [AD_ADM], "DIRECTORATE")).toBe(1);
    expect(tdStartIndex([GP_CDR], [], "UNIT")).toBe(1);
    expect(tdStartIndex([AO, DIR], [], "UNIT")).toBe(3);
  });
});
