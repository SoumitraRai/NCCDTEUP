import { describe, it, expect } from "vitest";
import {
  calculate,
  paymentBalance,
  csvCell,
  type Policy,
  type ClaimInput,
} from "../src/modules/finance/calculation";
const policy: Policy = {
  id: "test",
  version: 1,
  kind: "HONORARIUM",
  category: "DEMO",
  effectiveFrom: new Date("2020-01-01"),
  effectiveTo: new Date("2030-12-31"),
  ratePaise: 290000n,
  capPaise: 10000000n,
  partialMonthRule: "ACTUAL_DAYS_HALF_UP_DAILY",
  approved: true,
  synthetic: true,
};
const input: ClaimInput = {
  institutionId: "institution-1",
  kind: "HONORARIUM",
  category: "DEMO",
  periodStart: "2024-02-01",
  periodEnd: "2024-02-29",
  attendance: 1,
  sessions: 1,
  idempotencyKey: crypto.randomUUID(),
};
describe("exact, explicit financial rules", () => {
  it("handles full leap February", () =>
    expect(calculate(input, [policy]).totalPaise).toBe(290000n));
  it("handles partial month", () =>
    expect(
      calculate({ ...input, periodStart: "2024-02-15" }, [policy]).totalPaise,
    ).toBe(150000n));
  it("crosses financial year boundaries with daily half-up rounding", () =>
    expect(
      calculate(
        { ...input, periodStart: "2024-03-31", periodEnd: "2024-04-01" },
        [policy],
      ).totalPaise,
    ).toBe(9355n + 9667n));
  it("applies mid-period rate changes", () =>
    expect(
      calculate(input, [
        { ...policy, effectiveTo: new Date("2024-02-14") },
        {
          ...policy,
          id: "new",
          version: 2,
          effectiveFrom: new Date("2024-02-15"),
          ratePaise: 580000n,
        },
      ]).totalPaise,
    ).toBe(440000n));
  it("rounds half-paise up under the explicit daily rule", () =>
    expect(
      calculate(
        { ...input, periodStart: "2024-04-01", periodEnd: "2024-04-01" },
        [{ ...policy, ratePaise: 15n }],
      ).totalPaise,
    ).toBe(1n));
  it("rejects overlapping policies", () =>
    expect(() => calculate(input, [policy, policy])).toThrow("Exactly one"));
  it("rejects missing rank/category policy", () =>
    expect(() => calculate({ ...input, category: "OTHER" }, [policy])).toThrow(
      "Exactly one",
    ));
  it("rejects absent partial-month rule", () =>
    expect(() =>
      calculate(input, [{ ...policy, partialMonthRule: "" }]),
    ).toThrow("explicit"));
  it("rejects synthetic production policies", () =>
    expect(() => calculate(input, [policy], true)).toThrow("Exactly one"));
  it("rejects caps", () =>
    expect(() => calculate(input, [{ ...policy, capPaise: 1n }])).toThrow(
      "cap",
    ));
  it("rejects reversed dates", () =>
    expect(() =>
      calculate({ ...input, periodStart: "2024-03-01" }, [policy]),
    ).toThrow("valid period"));
  it("rejects impossible dates", () =>
    expect(() =>
      calculate({ ...input, periodEnd: "2024-02-30" }, [policy]),
    ).toThrow());
  it("rejects future dates", () =>
    expect(() =>
      calculate(
        { ...input, periodStart: "2029-01-01", periodEnd: "2029-01-01" },
        [policy],
        false,
        new Date("2026-01-01"),
      ),
    ).toThrow("Future"));
  it.each([0, -1, 1001])("rejects invalid attendance %s", (attendance) =>
    expect(() =>
      calculate(
        {
          ...input,
          kind: "REFRESHMENT",
          periodEnd: input.periodStart,
          attendance,
        },
        [{ ...policy, kind: "REFRESHMENT" }],
      ),
    ).toThrow(),
  );
  it("calculates attendance and sessions exactly", () =>
    expect(
      calculate(
        {
          ...input,
          kind: "REFRESHMENT",
          periodEnd: input.periodStart,
          attendance: 27,
          sessions: 2,
        },
        [{ ...policy, kind: "REFRESHMENT", ratePaise: 2500n }],
      ).totalPaise,
    ).toBe(135000n));
  it("rejects client supplied totals", () =>
    expect(() =>
      calculate({ ...input, totalPaise: "1" } as ClaimInput, [policy]),
    ).toThrow());
  it("supports partial and full payments with reversals", () => {
    expect(paymentBalance(100n, 0n, 40n)).toEqual({
      paidPaise: 40n,
      state: "PARTIALLY_PAID",
    });
    expect(paymentBalance(100n, 40n, 60n).state).toBe("PAID");
    expect(paymentBalance(100n, 100n, -100n).state).toBe("APPROVED");
  });
  it.each([101n, -1n, 0n])("rejects invalid payment %s", (amount) =>
    expect(() => paymentBalance(100n, 0n, amount)).toThrow(),
  );
  it("escapes formula injection and quotes in CSV", () => {
    expect(csvCell(" =cmd()")).toBe('"\' =cmd()"');
    expect(csvCell('a"b')).toBe('"a""b"');
  });
});
