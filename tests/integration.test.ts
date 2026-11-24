import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { db } from "../src/server/db";
import {
  createClaim,
  transitionClaim,
  recordPayment,
} from "../src/modules/finance/service";
import {
  createPublication,
  transitionPublication,
  publicContent,
} from "../src/modules/publications/service";
import {
  actorById,
  claimScope,
  requireInstitution,
  type Actor,
} from "../src/server/authorization";
import { downloadAttachment } from "../src/server/storage";
const actors: Record<string, Actor> = {};
const claimIds: string[] = [];
const pubIds: string[] = [];
beforeAll(async () => {
  for (const id of ["ano", "co", "group", "admin", "cadet", "ano2", "co2", "group2"]) {
    actors[id] = await actorById(id);
  }
});
afterAll(async () => {
  await db.paymentRecord.deleteMany({ where: { claimId: { in: claimIds } } });
  await db.approvalRequest.deleteMany({ where: { resourceId: { in: claimIds } } });
  await db.approvalAction.deleteMany({ where: { claimId: { in: claimIds } } });
  await db.claimLineItem.deleteMany({ where: { claimId: { in: claimIds } } });
  await db.claim.deleteMany({ where: { id: { in: claimIds } } });
  await db.publicContent.deleteMany({
    where: { publicationId: { in: pubIds } },
  });
  await db.consentRecord.deleteMany({
    where: { publicationId: { in: pubIds } },
  });
  await db.publicationRevision.deleteMany({
    where: { publicationId: { in: pubIds } },
  });
  await db.publication.deleteMany({ where: { id: { in: pubIds } } });
  await db.$disconnect();
});
async function draft(owner = "ano", date = "2023-01-01") {
  const c = await createClaim(actors[owner], {
    institutionId: owner === "ano2" ? "institution-2" : "institution-1",
    kind: "REFRESHMENT",
    category: "DEMO",
    periodStart: date,
    periodEnd: date,
    attendance: 10,
    sessions: 1,
    idempotencyKey: crypto.randomUUID(),
  });
  claimIds.push(c.id);
  return c;
}
async function approved(date: string) {
  const c = await draft("ano", date);
  await transitionClaim(actors.ano, { id: c.id, version: 1, action: "SUBMIT" });
  await transitionClaim(actors.co, { id: c.id, version: 2, action: "REVIEW" });
  await transitionClaim(actors.group, { id: c.id, version: 3, action: "APPROVE" });
  return c;
}
describe("real PostgreSQL access and workflows", () => {
  it("denies cross-institution, unit and group access", async () => {
    for (const id of ["ano2", "co2", "group2"])
      await expect(
        requireInstitution(actors[id], "institution-1", "read"),
      ).rejects.toThrow("Not permitted");
  });
  it("no permitted assignment never matches, even nested in AND", async () => {
    // Regression: Prisma treats an empty OR inside AND as match-all.
    await expect(
      requireInstitution(actors.ano, "institution-1", "publish"),
    ).rejects.toThrow("Not permitted");
    await expect(
      requireInstitution(actors.cadet, "institution-1", "review"),
    ).rejects.toThrow("Not permitted");
    expect(
      await db.claim.count({
        where: { AND: [claimScope(actors.cadet), { kind: "REFRESHMENT" }] },
      }),
    ).toBe(0);
  });
  it("cadets cannot create or query financial records", async () => {
    await expect(draft("cadet")).rejects.toThrow();
    expect(await db.claim.count({ where: claimScope(actors.cadet) })).toBe(0);
  });
  it("persists drafts and blocks ID tampering", async () => {
    const c = await draft();
    expect(await db.claim.findUnique({ where: { id: c.id } })).not.toBeNull();
    await expect(
      transitionClaim(actors.co2, { id: c.id, version: 1, action: "REVIEW" }),
    ).rejects.toThrow("not found");
  });
  it("blocks self-approval even for an admin", async () => {
    const c = await draft("admin", "2023-01-02");
    await transitionClaim(actors.admin, {
      id: c.id,
      version: 1,
      action: "SUBMIT",
    });
    await expect(
      transitionClaim(actors.admin, { id: c.id, version: 2, action: "REVIEW" }),
    ).rejects.toThrow("own submission");
  });
  it("returns same draft for a repeated idempotency key", async () => {
    const key = crypto.randomUUID();
    const input = {
      institutionId: "institution-1",
      kind: "REFRESHMENT",
      category: "DEMO",
      periodStart: "2023-01-03",
      periodEnd: "2023-01-03",
      attendance: 10,
      sessions: 1,
      idempotencyKey: key,
    };
    const c = await createClaim(actors.ano, input);
    claimIds.push(c.id);
    expect((await createClaim(actors.ano, input)).id).toBe(c.id);
  });
  it("rejects overlapping submitted claims", async () => {
    const c = await draft("ano", "2023-01-04");
    await transitionClaim(actors.ano, {
      id: c.id,
      version: 1,
      action: "SUBMIT",
    });
    const other = await draft("ano", "2023-01-04");
    await expect(
      transitionClaim(actors.ano, {
        id: other.id,
        version: 1,
        action: "SUBMIT",
      }),
    ).rejects.toThrow("overlaps");
  });
  it("serializes concurrent submission attempts", async () => {
    const c = await draft("ano", "2023-01-05");
    const r = await Promise.allSettled(
      [1, 2].map(() =>
        transitionClaim(actors.ano, { id: c.id, version: 1, action: "SUBMIT" }),
      ),
    );
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.claimLineItem.count({ where: { claimId: c.id } })).toBe(1);
  });
  it("serializes concurrent approvals", async () => {
    const c = await draft("ano", "2023-01-06");
    await transitionClaim(actors.ano, {
      id: c.id,
      version: 1,
      action: "SUBMIT",
    });
    await transitionClaim(actors.co, {
      id: c.id,
      version: 2,
      action: "REVIEW",
    });
    const r = await Promise.allSettled(
      [actors.group, actors.admin].map((a) =>
        transitionClaim(a, { id: c.id, version: 3, action: "APPROVE" }),
      ),
    );
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });
  it("records approval separately and prevents overpayment", async () => {
    const c = await approved("2023-01-07");
    const saved = await db.claim.findUniqueOrThrow({ where: { id: c.id } });
    expect(saved.state).toBe("APPROVED");
    expect(saved.paidPaise).toBe(0n);
    await expect(
      recordPayment(actors.co, {
        id: c.id,
        version: 4,
        amountPaise: "999999",
        reference: "test",
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow("exceeds");
    await recordPayment(actors.co, {
      id: c.id,
      version: 4,
      amountPaise: "10000",
      reference: "test",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(
      (await db.claim.findUniqueOrThrow({ where: { id: c.id } })).state,
    ).toBe("PARTIALLY_PAID");
  });
  it("serializes payments and supports an immutable reversal", async () => {
    const c = await approved("2023-01-08");
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        recordPayment(actors.co, {
          id: c.id,
          version: 4,
          amountPaise: "25000",
          reference: "test",
          idempotencyKey: crypto.randomUUID(),
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const payment = await db.paymentRecord.findFirstOrThrow({
      where: { claimId: c.id },
    });
    await recordPayment(actors.co, {
      id: c.id,
      version: 5,
      amountPaise: "25000",
      reference: "correction",
      reversalOf: payment.id,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(
      (await db.claim.findUniqueOrThrow({ where: { id: c.id } })).paidPaise,
    ).toBe(0n);
    expect(await db.paymentRecord.count({ where: { claimId: c.id } })).toBe(2);
  });
  it("keeps drafts private and requires consent before publication", async () => {
    const p = await createPublication(actors.ano, {
      institutionId: "institution-1",
      slug: `test-${crypto.randomUUID()}`,
      category: "VISIT",
      title: "Test publication",
      summary: "A synthetic public summary for privacy testing.",
      locale: "en",
      institutionDisplayName: "Demo College",
      district: "Lucknow",
      eventDate: "2023-01-01",
      publishAt: "2023-01-01T00:00:00Z",
    });
    pubIds.push(p.id);
    expect((await publicContent("en")).some((x) => x.slug === p.slug)).toBe(
      false,
    );
    await transitionPublication(actors.ano, {
      id: p.id,
      version: 1,
      action: "SUBMIT",
    });
    await transitionPublication(actors.co, {
      id: p.id,
      version: 2,
      action: "APPROVE",
    });
    await expect(
      transitionPublication(actors.admin, {
        id: p.id,
        version: 3,
        action: "PUBLISH",
      }),
    ).rejects.toThrow("permission");
    const consent = await db.consentRecord.create({
      data: {
        publicationId: p.id,
        recordedBy: "co",
        permissionConfirmed: true,
        guardianRequired: false,
        guardianConfirmed: false,
        synthetic: true,
      },
    });
    await db.publicationRevision.update({
      where: { id: p.revisions[0].id },
      data: { consentId: consent.id },
    });
    await transitionPublication(actors.admin, {
      id: p.id,
      version: 3,
      action: "PUBLISH",
    });
    const published = (await publicContent("en")).find(
      (x) => x.slug === p.slug,
    )!;
    expect(published).toBeDefined();
    for (const key of [
      "ownerId",
      "institutionId",
      "publicationId",
      "consentId",
      "email",
      "attachmentId",
      "totalPaise",
    ])
      expect(published).not.toHaveProperty(key);
    await transitionPublication(actors.admin, {
      id: p.id,
      version: 4,
      action: "WITHDRAW",
    });
    expect((await publicContent("en")).some((x) => x.slug === p.slug)).toBe(
      false,
    );
  });
  it("never issues a download for quarantined files", async () => {
    const c = await draft("ano", "2023-01-09");
    const a = await db.attachment.create({
      data: {
        ownerId: "ano",
        institutionId: "institution-1",
        resourceType: "claim",
        resourceId: c.id,
        objectKey: crypto.randomUUID(),
        declaredType: "application/pdf",
        size: 100,
      },
    });
    try {
      await expect(downloadAttachment(actors.ano, a.id)).rejects.toThrow(
        "not cleared",
      );
      await expect(downloadAttachment(actors.ano2, a.id)).rejects.toThrow(
        "Not permitted",
      );
    } finally {
      await db.attachment.delete({ where: { id: a.id } });
    }
  });
});
