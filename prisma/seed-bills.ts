// Synthetic bills, created through the real services so every bill carries a
// genuine approval history. The evidence image is generated here, stored in
// the private bucket and marked clean because the seed produced it.
import { PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { db } from "../src/server/db";
import { actorById, type Actor } from "../src/server/authorization";
import { storage, privateBucket } from "../src/server/storage";
import { createHonorarium, createRefreshment } from "../src/modules/bills/service";
import { recordPayment, transitionClaim } from "../src/modules/finance/service";
const marker = "Synthetic seed bill";
const actor = (id: string): Promise<Actor> => actorById(id);
async function evidence(ownerId: string, claimId: string, institutionId: string, purpose: string) {
  const objectKey = `seed/${claimId}.png`;
  const body = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#dfe7e2" } }).png().toBuffer();
  await storage.send(new PutObjectCommand({ Bucket: privateBucket, Key: objectKey, Body: body, ContentType: "image/png" }));
  await db.attachment.create({
    data: { ownerId, institutionId, resourceType: "claim", resourceId: claimId, objectKey, declaredType: "image/png", size: body.length, status: "CLEAN", purpose },
  });
}
// [owner, institution, date, rupees, cadets, outcome]
type Outcome = "DRAFT" | "SUBMITTED" | "RECOMMENDED" | "APPROVED" | "PAID" | "RETURNED";
const refreshments: [string, string, string, string, number, Outcome][] = [
  ["ano", "institution-1", "2026-07-14", "950", 42, "PAID"],
  ["ano", "institution-1", "2026-08-05", "800", 35, "APPROVED"],
  ["ano", "institution-1", "2026-09-18", "1200", 60, "RECOMMENDED"],
  ["ano", "institution-1", "2026-10-09", "600", 28, "SUBMITTED"],
  ["ano", "institution-1", "2026-10-28", "500", 25, "RETURNED"],
  ["ano", "institution-1", "2026-11-06", "700", 31, "DRAFT"],
  ["ano2", "institution-2", "2026-08-21", "650", 28, "PAID"],
  ["ano2", "institution-2", "2026-09-25", "1000", 48, "SUBMITTED"],
];
export async function seedBills() {
  if (await db.refreshmentDetail.count({ where: { paymentComments: marker } })) return;
  const subjects = await db.subject.findMany({ take: 3, orderBy: { name: "asc" } });
  const people = Object.fromEntries(await Promise.all(["ano", "ano2", "co", "co2", "group", "group2", "admin"].map(async (id) => [id, await actor(id)] as const)));
  const advance = async (claimId: string, owner: string, institutionId: string, purpose: string, outcome: Outcome) => {
    if (outcome === "DRAFT") return;
    const second = institutionId.startsWith("institution-2");
    const co = people[second ? "co2" : "co"], gp = people[second ? "group2" : "group"];
    await evidence(owner, claimId, institutionId, purpose);
    let v = (await transitionClaim(people[owner], { id: claimId, version: 1, action: "SUBMIT" })).version;
    if (outcome === "SUBMITTED") return;
    if (outcome === "RETURNED") {
      await transitionClaim(co, { id: claimId, version: v, action: "RETURN", comment: "Attach a clearer copy of the bill." });
      return;
    }
    v = (await transitionClaim(co, { id: claimId, version: v, action: "REVIEW" })).version;
    if (outcome === "RECOMMENDED") return;
    v = (await transitionClaim(gp, { id: claimId, version: v, action: "APPROVE" })).version;
    if (outcome === "APPROVED") return;
    const { totalPaise } = await db.claim.findUniqueOrThrow({ where: { id: claimId } });
    await recordPayment(people.admin, {
      id: claimId,
      version: v,
      amountPaise: totalPaise.toString(),
      reference: `SYN-${claimId.slice(-6).toUpperCase()}`,
      idempotencyKey: crypto.randomUUID(),
    });
  };
  for (const [owner, institutionId, date, amount, cadets, outcome] of refreshments) {
    const c = await createRefreshment(people[owner], {
      institutionId,
      category: "DEMO",
      instructorName: owner === "ano" ? "Demo Officer A" : "Demo Officer D",
      instructorAppointment: "ANO",
      claimedRupees: amount,
      idempotencyKey: crypto.randomUUID(),
      trainingStart: `${date}T09:30`,
      trainingEnd: `${date}T12:30`,
      instructorMobile: owner === "ano" ? "9000000001" : "9000000002",
      cadetsPresent: cadets,
      subjectIds: subjects.map((s) => s.id),
      periods: 3,
      paymentComments: marker,
    });
    await advance(c.id, owner, institutionId, "BILL", outcome);
  }
  const honoraria: [string, string, string, string, Outcome][] = [
    ["ano", "institution-1", "2026-04", "1500", "PAID"],
    ["ano", "institution-1", "2026-07", "1500", "RECOMMENDED"],
    ["ano2", "institution-2", "2026-06", "1500", "SUBMITTED"],
  ];
  for (const [owner, institutionId, month, amount, outcome] of honoraria) {
    const c = await createHonorarium(people[owner], {
      institutionId,
      category: "DEMO",
      instructorName: owner === "ano" ? "Demo Officer A" : "Demo Officer D",
      instructorRank: "Lt",
      instructorAppointment: "ANO",
      claimedRupees: amount,
      idempotencyKey: crypto.randomUUID(),
      periodStart: `${month}-01`,
      periodEnd: `${month}-30`,
    });
    await advance(c.id, owner, institutionId, "DOCUMENT", outcome);
  }
}
