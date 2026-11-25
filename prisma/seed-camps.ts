// Synthetic camps in every state, made through the real services. Camps that
// are running or over are planned ahead and then moved back in time (only
// the service's "starts after today" rule stops planning them directly).
import { PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { db } from "../src/server/db";
import { actorById } from "../src/server/authorization";
import { istDate, resolveTrainingYear } from "../src/modules/platform/training-year";
import { storage, privateBucket } from "../src/server/storage";
import { cancelCamp, createCamp, decideReport, submitReport } from "../src/modules/camps/service";
import { createBudget, decideBudget } from "../src/modules/camps/budgets";
const marker = "Synthetic seed camp, not an NCC record.";
const inDays = (n: number) => new Date(Date.parse(`${istDate()}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00Z`);
async function reportFile(campId: string, ownerId: string) {
  const body = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#e8ecf4" } })
    .composite([{ input: Buffer.from(`<svg width="640" height="480"><text x="40" y="240" font-size="28" font-family="sans-serif">Synthetic camp report</text></svg>`) }])
    .png()
    .toBuffer();
  const objectKey = `seed/camp-${campId}.png`;
  await storage.send(new PutObjectCommand({ Bucket: privateBucket, Key: objectKey, Body: body, ContentType: "image/png" }));
  await db.attachment.create({ data: { ownerId, institutionId: "", resourceType: "camp", resourceId: campId, objectKey, declaredType: "image/png", size: body.length, status: "CLEAN", purpose: "REPORT", scannedAt: new Date() } });
}
// Synthetic authorised and enrolled cadets for every seeded institution
// (current training year), and briefing dates for the upcoming camps.
async function seedStrength() {
  const { year } = await resolveTrainingYear();
  const institutions = await db.institution.findMany({ where: { active: true, id: { startsWith: "institution-" } }, orderBy: { id: "asc" } });
  for (const [k, i] of institutions.entries()) {
    const a = 40 + 10 * (k % 4);
    await db.cadetStrength.upsert({
      where: { institutionId_trainingYear: { institutionId: i.id, trainingYear: year.label } },
      create: { institutionId: i.id, trainingYear: year.label, updatedById: "co", authJD: a, authJW: a - 10, authSD: a + 20, authSW: a, enrJD: a - 4, enrJW: a - 13, enrSD: a + 15, enrSW: a - 6 },
      update: {},
    });
  }
  for (const [catc, before] of [["CATC-201", 5], ["CATC-202", 7]] as const) {
    const camp = await db.camp.findFirst({ where: { catcNo: catc, details: marker, briefingDate: null } });
    if (camp) await db.camp.update({ where: { id: camp.id }, data: { briefingDate: new Date(camp.startDate.getTime() - before * 86_400_000) } });
  }
}
// Synthetic reference rates for camp budgets (paise per cadet-day, ANO-day,
// staff-day or litre). Development fixtures, never NCC rates.
async function seedRates() {
  const rates = { CADET_MESSING: 15000n, ANO_DA: 50000n, STAFF_DA: 40000n, FUEL_DIESEL: 9000n, FUEL_PETROL: 10000n };
  for (const [category, ratePaise] of Object.entries(rates))
    await db.financialRatePolicy.upsert({
      where: { id: `demo-CAMP-${category}` },
      create: { id: `demo-CAMP-${category}`, name: "Development fixture — not an NCC rate", version: 1, kind: "CAMP", category, effectiveFrom: new Date("2020-01-01"), effectiveTo: new Date("2030-12-31"), ratePaise, capPaise: 0n, partialMonthRule: "NONE", approved: true, synthetic: true },
      update: {},
    });
}
// Synthetic budgets through the real services, one in each state.
const budgetNote = "Synthetic seed budget, not an NCC figure.";
async function seedBudgets() {
  if (await db.campBudget.count({ where: { note: { startsWith: budgetNote } } })) return;
  const camp = (catcNo: string) => db.camp.findFirst({ where: { catcNo, details: marker } });
  const version = async (id: string) => (await db.campBudget.findUniqueOrThrow({ where: { id } })).version;
  const [c201, c202, c203, c207] = await Promise.all(["CATC-201", "CATC-202", "CATC-203", "CATC-207"].map(camp));
  if (!c201 || !c202 || !c203 || !c207) return;
  // Initial demand waiting for the Gp Cdr.
  await createBudget(await actorById("co"), { campId: c201.id, stage: "INITIAL", amount: "520000", cadets: 370, anos: 12, staff: 6, note: budgetNote });
  // A Gp Cdr's initial demand goes to the DDG, sanctioned for less.
  const b202 = await createBudget(await actorById("group"), { campId: c202.id, stage: "INITIAL", amount: "410000", cadets: 280, anos: 9, staff: 4, note: `${budgetNote} Breakup to follow.` });
  await decideBudget(await actorById("admin"), b202.id, { decision: "APPROVE", remarks: "Sanctioned at the reduced strength.", sanctioned: "380000", version: await version(b202.id) });
  // A running camp that had no initial files a revised budget.
  await createBudget(await actorById("co2"), { campId: c203.id, stage: "REVISED", amount: "455000", cadets: 330, anos: 10, staff: 5, note: `${budgetNote} No initial was filed before the camp.` });
  // A completed camp's final budget with a breakup, sanctioned.
  const b207 = await createBudget(await actorById("ao"), {
    campId: c207.id,
    stage: "FINAL",
    amount: "398000",
    cadets: 267,
    anos: 9,
    staff: 4,
    note: budgetNote,
    lines: [
      { head: "CADET_MESSING", amount: "300000" },
      { head: "ANO_DA", amount: "45000" },
      { head: "BUS_FARE", amount: "35000" },
      { head: "FUEL_DIESEL", quantity: 200, amount: "18000" },
    ],
  });
  await decideBudget(await actorById("group"), b207.id, { decision: "RECOMMEND", remarks: "", version: await version(b207.id) });
  await decideBudget(await actorById("admin"), b207.id, { decision: "APPROVE", remarks: "", version: await version(b207.id) });
}
export async function seedCamps() {
  await seedRates();
  await db.unit.upsert({ where: { id: "unit-1b" }, create: { id: "unit-1b", name: "Demo Unit 1B", groupId: "group-1" }, update: {} });
  if (await db.camp.count({ where: { details: marker } })) return seedStrength().then(seedBudgets);
  const as = actorById;
  // [by, host, catc, location, start, end (days from today, as finally held), planned, seats]
  const camps = [
    ["co", "unit-1", "201", "Demo Lucknow camp ground", 12, 21, 400, [["unit-1", 250], ["unit-1b", 120]]],
    ["group", "unit-1b", "202", "Demo Sitapur range", 60, 69, 300, [["unit-1b", 200], ["unit-1", 80]]],
    ["co2", "unit-2", "203", "Demo Varanasi ghats camp", -3, 6, 350, [["unit-2", 330]]],
    ["co", "unit-1", "204", "Demo Barabanki school campus", -14, -5, 300, [["unit-1", 180], ["unit-1b", 100]]],
    ["co2", "unit-2", "205", "Demo Mirzapur camp ground", -39, -30, 250, [["unit-2", 240]]],
    ["co", "unit-1", "206", "Demo Unnao stadium", -19, -10, 320, [["unit-1", 200], ["unit-1b", 110]]],
    ["ao", "unit-1", "207", "Demo Rae Bareli campus", -69, -60, 280, [["unit-1", 180], ["unit-1b", 90]]],
    ["co", "unit-1", "208", "Demo Hardoi ground", 30, 39, 200, [["unit-1", 150]]],
  ] as const;
  const ids: Record<string, string> = {};
  for (const [by, unitId, catc, location, start, end, planned, seats] of camps) {
    const ahead = Math.max(start, 1) - start;
    const made = await createCamp(await as(by), {
      unitId,
      catcNo: `CATC-${catc}`,
      location,
      start: inDays(start + ahead),
      end: inDays(end + ahead),
      plannedStrength: planned,
      seats: seats.map(([u, n]) => ({ unitId: u, seats: n })),
      details: marker,
    });
    if (ahead) await db.camp.update({ where: { id: made.id }, data: { startDate: day(inDays(start)), endDate: day(inDays(end)) } });
    ids[catc] = made.id;
  }
  const version = async (id: string) => (await db.camp.findUniqueOrThrow({ where: { id } })).version;
  const attendance = async (id: string, less: number) => (await db.campAllocation.findMany({ where: { campId: id } })).map((s) => ({ unitId: s.unitId, attended: Math.max(0, s.seats - less) }));
  // 206: submitted by the CO, waiting for the group.
  await reportFile(ids["206"], "co");
  await submitReport(await as("co"), ids["206"], { attendance: await attendance(ids["206"], 6), version: await version(ids["206"]) });
  // 207: submitted by the AO, returned once, sent again and accepted.
  await reportFile(ids["207"], "ao");
  await submitReport(await as("ao"), ids["207"], { attendance: await attendance(ids["207"], 4), version: await version(ids["207"]) });
  await decideReport(await as("group"), ids["207"], { decision: "RETURN", remarks: "Add the medical inspection sheet.", version: await version(ids["207"]) });
  await submitReport(await as("ao"), ids["207"], { attendance: await attendance(ids["207"], 3), version: await version(ids["207"]) });
  await decideReport(await as("group"), ids["207"], { decision: "ACCEPT", remarks: "", version: await version(ids["207"]) });
  await cancelCamp(await as("co"), ids["208"], { reason: "Venue not available on these dates.", version: await version(ids["208"]) });
  await seedStrength();
  await seedBudgets();
}
