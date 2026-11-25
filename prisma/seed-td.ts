// Synthetic officers who complete the TD chain (Director, ADG, a Branch
// officer with the movement duty, an AO) and a few synthetic TDs, created
// through the real services so each carries a genuine approval history.
import { db } from "../src/server/db";
import { actorById } from "../src/server/authorization";
import { istDate } from "../src/modules/platform/training-year";
import { createTd, decideTd } from "../src/modules/movement/service";
const marker = "Synthetic seed TD";
const officers = [
  ["dir", "Demo DIR", "DTE_STAFF", "DIR", { level: "DIRECTORATE", directorateId: "dte-up" }, []],
  ["adg", "Demo ADG", "ADMIN", "ADG", { level: "DIRECTORATE", directorateId: "dte-up" }, ["publish", "payment"]],
  ["branch", "Demo BRANCH", "DTE_STAFF", "BR_PNC", { level: "DIRECTORATE", directorateId: "dte-up" }, ["movement"]],
  ["ao", "Demo AO", "CO", "AO", { level: "UNIT", unitId: "unit-1" }, []],
] as const;
const inDays = (n: number) => new Date(Date.parse(`${istDate()}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const when = (start: number, end: number) => ({ start: { date: inDays(start), half: "FN" }, end: { date: inDays(end), half: "AN" } });
export async function seedTd(password: string) {
  for (const [id, name, role, appointmentCode, anchor, capabilities] of officers) {
    await db.user.upsert({ where: { id }, create: { id, name, email: `${id}@sampark.test`, emailVerified: true }, update: {} });
    await db.account.upsert({ where: { id: `account-${id}` }, create: { id: `account-${id}`, accountId: id, providerId: "credential", userId: id, password }, update: {} });
    await db.roleAssignment.upsert({ where: { id: `role-${id}` }, create: { id: `role-${id}`, userId: id, role, appointmentCode, capabilities: [...capabilities], ...anchor }, update: {} });
  }
  if (await db.tdRequest.count({ where: { purpose: { startsWith: marker } } })) return;
  const as = actorById;
  const decide = async (by: string, id: string, decision: string) => {
    const { version } = await db.tdRequest.findUniqueOrThrow({ where: { id } });
    await decideTd(await as(by), id, { decision, remarks: "", version });
  };
  const aoPost = `role-ao`;
  // Waiting at the Gp Cdr.
  await createTd(await as("ao"), { mode: "OWN", postId: aoPost, from: "Demo Unit 1", to: "Lucknow", ...when(10, 12), purpose: `${marker}: board of officers at Group HQ`, ownArrangement: false });
  // A typed-in PI sent by the Gp Cdr, recommended by the Branch, now with the Director.
  const pi = await createTd(await as("group"), { mode: "SEND", traveller: { name: "Demo PI", rank: "Sub", formation: { level: "UNIT", id: "unit-1" } }, from: "Demo Unit 1", to: "Agra", ...when(5, 6), purpose: `${marker}: escort for the camp advance party`, ownArrangement: true });
  await decide("branch", pi.id, "RECOMMEND");
  // Sent by the DDG, approved by the ADG, already over (Completed).
  const done = await createTd(await as("admin"), { mode: "SEND", traveller: { postId: aoPost }, from: "Demo Unit 1", to: "Varanasi", ...when(-20, -18), purpose: `${marker}: court of inquiry`, ownArrangement: false });
  await decide("adg", done.id, "APPROVE");
}
