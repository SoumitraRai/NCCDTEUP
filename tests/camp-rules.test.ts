import { describe, it, expect } from "vitest";
import { campDays, campState, checkPlan, reportDueDate, reportState } from "../src/modules/camps/rules";
// Camp state, report deadline (a development default) and plan checks.
const camp = { status: "PLANNED", start: "2026-12-01", end: "2026-12-10", reportStatus: "NONE" };
describe("camp state", () => {
  it("is upcoming before, current on both end days, completed after", () => {
    expect(campState(camp, "2026-11-30")).toBe("UPCOMING");
    expect([campState(camp, "2026-12-01"), campState(camp, "2026-12-10")]).toEqual(["CURRENT", "CURRENT"]);
    expect(campState(camp, "2026-12-11")).toBe("COMPLETED");
    expect(campState({ ...camp, status: "CANCELLED" }, "2026-12-05")).toBe("CANCELLED");
  });
  it("counts both dates", () => {
    expect(campDays("2026-12-01", "2026-12-10")).toBe(10);
    expect(campDays("2026-12-01", "2026-12-01")).toBe(1);
  });
});
describe("report state", () => {
  it("is due for 15 days after the camp, then overdue", () => {
    expect(reportDueDate("2026-12-10")).toBe("2026-12-25");
    expect(reportState(camp, "2026-12-05")).toBe("NOT_YET");
    expect(reportState(camp, "2026-12-25")).toBe("DUE");
    expect(reportState(camp, "2026-12-26")).toBe("OVERDUE");
  });
  it("follows the stored status once submitted", () => {
    for (const s of ["SUBMITTED", "ACCEPTED", "RETURNED"]) expect(reportState({ ...camp, reportStatus: s }, "2027-02-01")).toBe(s);
  });
});
describe("plan checks", () => {
  const plan = { start: "2026-12-01", end: "2026-12-10", plannedStrength: 500, hostUnitId: "u1", seats: [{ unitId: "u1", seats: 300 }, { unitId: "u2", seats: 150 }] };
  it("accepts seats up to the planned strength and returns the total", () => {
    expect(checkPlan(plan)).toBe(450);
  });
  it("refuses over-allocation, repeated units, a host without seats and bad dates", () => {
    expect(() => checkPlan({ ...plan, plannedStrength: 400 })).toThrow("Seats allocated (450) are more than the planned strength (400).");
    expect(() => checkPlan({ ...plan, seats: [...plan.seats, { unitId: "u2", seats: 1 }] })).toThrow("List each unit once.");
    expect(() => checkPlan({ ...plan, hostUnitId: "u3" })).toThrow("Give the host unit its seats.");
    expect(() => checkPlan({ ...plan, end: "2026-11-30" })).toThrow("The camp must end on or after its start.");
    expect(() => checkPlan({ ...plan, end: "2027-01-15" })).toThrow("A camp can last at most 30 days.");
    expect(() => checkPlan({ ...plan, briefing: "2026-12-02" })).toThrow("Hold the briefing on or before the first day of the camp.");
    expect(checkPlan({ ...plan, briefing: "2026-12-01" })).toBe(450);
  });
});
