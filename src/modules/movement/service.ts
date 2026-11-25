import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { AppError, actorById, assignmentInclude, assignmentsWithin, liveAssignments, toAssignment, type Actor, type Assignment } from "@/server/authorization";
import { audit } from "@/modules/audit";
import { awaiting, cancelRequest, decide, openRequest, pendingWhere, timeline, type Chain } from "@/modules/approvals/engine";
import { chainOf } from "@/modules/identity/officer-registration";
import { page, terms, type ListQuery } from "@/modules/platform/query";
import { istDate, resolveTrainingYear } from "@/modules/platform/training-year";
import { canSend, checkNotice, tdHalfDays, tdStartIndex, within, type Half } from "./rules";
type Tx = Prisma.TransactionClient;
// Officer roles may send someone on TD; ANOs, CTOs and cadets may not.
const OFFICER_ROLES = ["CO", "GROUP", "GROUP_STAFF", "ADMIN", "DTE_STAFF"];
const LEVELS = ["UNIT", "GROUP", "DIRECTORATE"] as const;
const officerPosts = (actor: Actor) => actor.assignments.filter((a) => OFFICER_ROLES.includes(a.role));
// The formation key an officer role reaches down from.
const reachKey = (role: string) =>
  role === "ADMIN" || role === "DTE_STAFF" ? "directorateId" : role === "GROUP" || role === "GROUP_STAFF" ? "groupId" : role === "CO" ? "unitId" : null;
// A sender post may send someone only if it may send every post they hold
// within its formation (so another post does not hide a senior one).
const canSendPost = (senders: Assignment[], post: Assignment, all: Assignment[]) =>
  senders.some((s) => canSend(s, post) && all.every((p) => !within(s, p) || canSend(s, p)));
// Who sees a TD: its creator, its traveller, and officers whose post covers
// the traveller's formation.
export function tdScope(actor: Actor): Prisma.TdRequestWhereInput {
  const or: Prisma.TdRequestWhereInput[] = [{ createdById: actor.id }, { travellerId: actor.id }];
  for (const a of officerPosts(actor)) {
    const k = reachKey(a.role);
    const value = k && a.anchor[k];
    if (k && value) or.push({ [k]: value });
  }
  return { OR: or };
}
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date.");
const when = z.object({ date, half: z.enum(["FN", "AN"]) }).strict();
const fields = {
  from: z.string().trim().min(1, "Enter where the duty starts from.").max(120, "Keep the place under 120 characters."),
  to: z.string().trim().min(1, "Enter where the duty is.").max(120, "Keep the place under 120 characters."),
  start: when,
  end: when,
  purpose: z.string().trim().min(1, "Enter the purpose.").max(500, "Keep the purpose under 500 characters."),
  ownArrangement: z.boolean().default(false),
};
const typedTraveller = z
  .object({
    name: z.string().trim().min(1, "Enter the traveller's name.").max(100, "Keep the name under 100 characters."),
    rank: z.string().trim().min(1, "Enter the traveller's rank.").max(40, "Keep the rank under 40 characters."),
    formation: z.object({ level: z.enum(LEVELS), id: z.string().min(1).max(40) }).strict(),
  })
  .strict();
const createInput = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("OWN"), postId: z.string().min(1).max(40), ...fields }).strict(),
  z.object({ mode: z.literal("SEND"), traveller: z.union([z.object({ postId: z.string().min(1).max(40) }).strict(), typedTraveller]), ...fields }).strict(),
]);
const resubmitInput = z.object({ ...fields, version: z.number().int().positive() }).strict();
const versionInput = z.object({ version: z.number().int().positive() }).strict();
const decideInput = z
  .object({
    decision: z.enum(["RECOMMEND", "NOT_RECOMMEND", "APPROVE", "RETURN", "REJECT"]),
    remarks: z.string().max(1000).default(""),
    version: z.number().int().positive(),
  })
  .strict();
type Fields = { [K in keyof typeof fields]: z.infer<(typeof fields)[K]> };
const day = (d: string) => new Date(`${d}T00:00:00Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const today = () => day(istDate());
const dates = (f: Fields) => ({
  fromPlace: f.from,
  toPlace: f.to,
  startDate: day(f.start.date),
  startHalf: f.start.half,
  endDate: day(f.end.date),
  endHalf: f.end.half,
  halfDays: tdHalfDays(f.start, f.end),
  purpose: f.purpose,
  ownArrangement: f.ownArrangement,
});
type TdRow = Prisma.TdRequestGetPayload<object>;
const snapshot = (td: TdRow) => ({
  travellerName: td.travellerName,
  travellerRank: td.travellerRank,
  travellerPost: td.travellerPost,
  from: td.fromPlace,
  to: td.toPlace,
  start: { date: ymd(td.startDate), half: td.startHalf },
  end: { date: ymd(td.endDate), half: td.endHalf },
  halfDays: td.halfDays,
  purpose: td.purpose,
  ownArrangement: td.ownArrangement,
});
// Notices go to an account-holding traveller of a TD someone else created.
// Messages are stored in English; the dashboard shows them in Hindi too.
async function notify(tx: Tx, td: TdRow, message: string) {
  if (td.kind !== "SENT" || !td.travellerId) return;
  await tx.notification.create({ data: { userId: td.travellerId, message, resourceId: td.id, link: `/dashboard/movement/td?open=${td.id}` } });
}
export const TD_NOTICES = {
  sent: "You have been sent on temporary duty.",
  changed: "Your temporary duty was changed and sent again.",
  cancelled: "Your temporary duty was cancelled.",
  approved: "Your temporary duty was approved.",
  rejected: "Your temporary duty was rejected.",
} as const;
const serializable = { isolationLevel: "Serializable" as const };
// The traveller, their formation chain and their live assignments.
async function travellerOf(actor: Actor, input: z.infer<typeof createInput>) {
  const postInclude = { ...assignmentInclude, appointment: true, user: true } satisfies Prisma.RoleAssignmentInclude;
  const live = { ...liveAssignments(), level: { in: [...LEVELS] } };
  if (input.mode === "OWN") {
    const post = await db.roleAssignment.findFirst({ where: { id: input.postId, userId: actor.id, ...live }, include: postInclude });
    if (!post) throw new AppError(400, "Choose one of your posts.");
    const a = toAssignment(post);
    return { id: actor.id, name: actor.name, rank: "", post: post.appointment?.title ?? "", level: post.level, anchor: a.anchor, assignments: actor.assignments };
  }
  const senders = officerPosts(actor);
  if (!senders.length) throw new AppError(403, "Only officers can send someone on temporary duty.");
  const t = input.traveller;
  if ("postId" in t) {
    const post = await db.roleAssignment.findFirst({
      where: { AND: [{ id: t.postId, ...live }, assignmentsWithin({ ...actor, assignments: senders }, "read")] },
      include: postInclude,
    });
    if (!post) throw new AppError(403, "Choose someone in your formation.");
    if (post.userId === actor.id) throw new AppError(400, "For your own temporary duty, choose For myself.");
    const a = toAssignment(post);
    const assignments = (await actorById(post.userId)).assignments;
    if (!canSendPost(senders, a, assignments)) throw new AppError(403, "You can send only someone junior to you.");
    return { id: post.userId, name: post.user.name, rank: "", post: post.appointment?.title ?? "", level: post.level, anchor: a.anchor, assignments };
  }
  const { level, id } = t.formation;
  const found = level === "DIRECTORATE" ? await db.directorate.findUnique({ where: { id } }).then((d) => d && { unitId: null, groupId: null, directorateId: d.id }) : await chainOf({ level, unitId: level === "UNIT" ? id : null, groupId: level === "GROUP" ? id : null, directorateId: null });
  const chain = found && { level, institutionId: null, ...found };
  if (!chain || !senders.some((a) => canSend(a, { level, appointmentCode: null, anchor: { institutionId: null, ...found } }))) throw new AppError(403, "Choose a unit, group or directorate under you.");
  return { id: null, name: t.name, rank: t.rank, post: "", level, anchor: { institutionId: null, ...found }, assignments: [] as Assignment[] };
}
export async function createTd(actor: Actor, raw: unknown) {
  const input = createInput.parse(raw);
  const traveller = await travellerOf(actor, input);
  const values = dates(input);
  if (input.mode === "OWN") checkNotice(input.start.date, istDate());
  const level = traveller.level as (typeof LEVELS)[number];
  const chain: Chain = { level, institutionId: null, unitId: traveller.anchor.unitId, groupId: traveller.anchor.groupId, directorateId: traveller.anchor.directorateId };
  const startIndex = tdStartIndex(actor.assignments, traveller.assignments, level);
  return db.$transaction(async (tx) => {
    let td = await tx.tdRequest.create({
      data: {
        createdById: actor.id,
        travellerId: traveller.id,
        travellerName: traveller.name,
        travellerRank: traveller.rank,
        travellerPost: traveller.post,
        kind: input.mode === "OWN" ? "OWN" : "SENT",
        level,
        unitId: chain.unitId,
        groupId: chain.groupId,
        directorateId: chain.directorateId,
        ...values,
      },
    });
    await tx.tdSubmission.create({ data: { tdId: td.id, cycle: 1, snapshot: snapshot(td) } });
    const req = await openRequest(tx, { workflow: "TD", resourceId: td.id, requesterId: actor.id, travellerId: traveller.id, chain, startIndex });
    if (req.status !== td.status) td = await tx.tdRequest.update({ where: { id: td.id }, data: { status: req.status } });
    await audit(tx, actor.id, "td.created", td.id, { kind: td.kind, startIndex });
    await notify(tx, td, TD_NOTICES.sent);
    return { id: td.id, status: td.status };
  }, serializable);
}
const queues = {
  pending: () => ({ status: { in: ["PENDING", "RETURNED"] } }),
  completed: () => ({ status: "APPROVED", endDate: { lt: today() } }),
  disposed: () => ({ OR: [{ status: "APPROVED", endDate: { gte: today() } }, { status: { in: ["REJECTED", "CANCELLED"] } }] }),
} satisfies Record<string, () => Prisma.TdRequestWhereInput>;
export type TdQueue = keyof typeof queues;
// Names of the units, groups and directorates the rows belong to.
async function formationNames(rows: TdRow[]) {
  const ids = (k: "unitId" | "groupId" | "directorateId") => [...new Set(rows.map((r) => r[k]).filter((v): v is string => !!v))];
  const [units, groups, dtes] = await Promise.all([
    db.unit.findMany({ where: { id: { in: ids("unitId") } }, select: { id: true, name: true } }),
    db.group.findMany({ where: { id: { in: ids("groupId") } }, select: { id: true, name: true } }),
    db.directorate.findMany({ where: { id: { in: ids("directorateId") } }, select: { id: true, name: true } }),
  ]);
  const names = new Map([...units, ...groups, ...dtes].map((f) => [f.id, f.name]));
  return (r: TdRow) => names.get((r.level === "UNIT" ? r.unitId : r.level === "GROUP" ? r.groupId : r.directorateId) ?? "") ?? "";
}
async function present(actor: Actor, rows: TdRow[]) {
  const [formation, requests, people] = await Promise.all([
    formationNames(rows),
    db.approvalRequest.findMany({ where: { workflow: "TD", resourceId: { in: rows.map((r) => r.id) } } }),
    db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, name: true } }),
  ]);
  const byId = new Map(requests.map((r) => [r.resourceId, r]));
  const names = new Map(people.map((p) => [p.id, p.name]));
  return rows.map((r) => {
    const req = byId.get(r.id);
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      version: r.version,
      traveller: { name: r.travellerName, rank: r.travellerRank, post: r.travellerPost, account: !!r.travellerId },
      formation: formation(r),
      level: r.level,
      from: r.fromPlace,
      to: r.toPlace,
      start: { date: ymd(r.startDate), half: r.startHalf as Half },
      end: { date: ymd(r.endDate), half: r.endHalf as Half },
      halfDays: r.halfDays,
      purpose: r.purpose,
      ownArrangement: r.ownArrangement,
      createdBy: names.get(r.createdById) ?? "",
      createdAt: r.createdAt,
      mine: r.createdById === actor.id,
      travelling: r.travellerId === actor.id,
      returnedToMe: r.status === "RETURNED" && r.createdById === actor.id,
      stageIndex: req?.stageIndex ?? 0,
      startIndex: req?.startIndex ?? 0,
    };
  });
}
export async function listTd(actor: Actor, q: ListQuery & { queue: TdQueue; mine?: boolean }) {
  const { year } = await resolveTrainingYear(q.year);
  const base: Prisma.TdRequestWhereInput[] = [
    tdScope(actor),
    { startDate: { gte: year.startsOn, lte: year.endsOn } },
    ...(q.mine ? [{ OR: [{ createdById: actor.id }, { travellerId: actor.id }] }] : []),
  ];
  const search = terms(q.q).map((t) => ({
    OR: (["travellerName", "fromPlace", "toPlace", "purpose"] as const).map((k) => ({ [k]: { contains: t, mode: "insensitive" as const } })),
  }));
  const where = { AND: [...base, ...search, queues[q.queue]()] };
  const count = (queue: TdQueue) => db.tdRequest.count({ where: { AND: [...base, queues[queue]()] } });
  const [rows, total, pending, disposed, completed] = await Promise.all([
    db.tdRequest.findMany({ where, orderBy: { createdAt: q.sort === "oldest" ? "asc" : "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    db.tdRequest.count({ where }),
    count("pending"),
    count("disposed"),
    count("completed"),
  ]);
  return { ...page(await present(actor, rows), total, q), counts: { pending, disposed, completed }, year: year.label };
}
async function visible(actor: Actor, id: string, tx: Tx | typeof db = db) {
  const td = await tx.tdRequest.findFirst({ where: { AND: [{ id }, tdScope(actor)] } });
  if (!td) throw new AppError(404, "TD not found.");
  return td;
}
const decidable = async (actor: Actor, id: string) =>
  !!(await db.approvalRequest.findFirst({ where: { AND: [await pendingWhere(actor), { workflow: "TD", resourceId: id }] }, select: { id: true } }));
export async function getTd(actor: Actor, id: string) {
  const td = await visible(actor, id);
  const [row] = await present(actor, [td]);
  const editable = td.createdById === actor.id;
  return {
    ...row,
    approval: await timeline("TD", id),
    awaiting: await awaiting("TD", id),
    submissions: (await db.tdSubmission.findMany({ where: { tdId: id }, orderBy: { cycle: "asc" } })).map((s) => ({ cycle: s.cycle, snapshot: s.snapshot, at: s.createdAt })),
    canDecide: await decidable(actor, id),
    canEdit: editable && td.status === "RETURNED",
    canCancel: editable && ["PENDING", "RETURNED"].includes(td.status),
  };
}
// Loads a TD for a change by its creator at the version they saw.
async function forCreator(tx: Tx, actor: Actor, id: string, version: number) {
  const td = await visible(actor, id, tx);
  if (td.createdById !== actor.id) throw new AppError(403, "Only the person who created this TD can change it.");
  if (td.version !== version) throw new AppError(409, "This TD changed. Refresh and try again.");
  return td;
}
const bump = async (tx: Tx, td: TdRow, data: Prisma.TdRequestUpdateManyMutationInput) => {
  const updated = await tx.tdRequest.updateMany({ where: { id: td.id, version: td.version }, data: { ...data, version: { increment: 1 } } });
  if (!updated.count) throw new AppError(409, "This TD changed. Refresh and try again.");
  return tx.tdRequest.findUniqueOrThrow({ where: { id: td.id } });
};
export async function resubmitTd(actor: Actor, id: string, raw: unknown) {
  const input = resubmitInput.parse(raw);
  return db.$transaction(async (tx) => {
    const td = await forCreator(tx, actor, id, input.version);
    if (td.status !== "RETURNED") throw new AppError(409, "Only a returned TD can be edited.");
    // A TD returned close to its date can go back unless its start moved.
    if (td.kind === "OWN" && input.start.date !== ymd(td.startDate)) checkNotice(input.start.date, istDate());
    const before = JSON.stringify(snapshot(td));
    let next = await bump(tx, td, { ...dates(input), status: "PENDING" });
    const req = await openRequest(tx, { workflow: "TD", resourceId: td.id, requesterId: actor.id, travellerId: td.travellerId, chain: { level: td.level as Chain["level"], institutionId: null, unitId: td.unitId, groupId: td.groupId, directorateId: td.directorateId } });
    if (req.status !== next.status) next = await tx.tdRequest.update({ where: { id }, data: { status: req.status } });
    await tx.tdSubmission.create({ data: { tdId: id, cycle: req.cycle, snapshot: snapshot(next) } });
    await audit(tx, actor.id, "td.resubmitted", id, { cycle: req.cycle });
    if (JSON.stringify(snapshot(next)) !== before) await notify(tx, next, TD_NOTICES.changed);
    return { id, status: next.status, version: next.version };
  }, serializable);
}
export async function cancelTd(actor: Actor, id: string, raw: unknown) {
  const input = versionInput.parse(raw);
  return db.$transaction(async (tx) => {
    const td = await forCreator(tx, actor, id, input.version);
    if (!["PENDING", "RETURNED"].includes(td.status)) throw new AppError(409, "This request can no longer be cancelled.");
    await cancelRequest(tx, "TD", id, actor.id);
    const next = await bump(tx, td, { status: "CANCELLED" });
    await audit(tx, actor.id, "td.cancelled", id);
    await notify(tx, next, TD_NOTICES.cancelled);
    return { id, status: next.status, version: next.version };
  }, serializable);
}
export async function decideTd(actor: Actor, id: string, raw: unknown) {
  const input = decideInput.parse(raw);
  return db.$transaction(async (tx) => {
    const td = await visible(actor, id, tx);
    if (td.version !== input.version) throw new AppError(409, "This TD changed. Refresh and try again.");
    const req = await decide(tx, actor, { workflow: "TD", resourceId: id, decision: input.decision, remarks: input.remarks });
    const next = await bump(tx, td, { status: req.status });
    await audit(tx, actor.id, "td.decided", id, { decision: input.decision, stage: req.stageIndex });
    if (next.status === "APPROVED") await notify(tx, next, TD_NOTICES.approved);
    if (next.status === "REJECTED") await notify(tx, next, TD_NOTICES.rejected);
    return { id, status: next.status, version: next.version };
  }, serializable);
}
// TDs awaiting a decision by this actor, oldest first.
export async function tdInbox(actor: Actor) {
  const requests = await db.approvalRequest.findMany({
    where: { AND: [await pendingWhere(actor), { workflow: "TD" }] },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });
  const rows = await db.tdRequest.findMany({ where: { AND: [{ id: { in: requests.map((r) => r.resourceId) } }, tdScope(actor)] } });
  const shown = new Map((await present(actor, rows)).map((r) => [r.id, r]));
  return requests.flatMap((r) => {
    const td = shown.get(r.resourceId);
    return td ? [{ ...td, waitingSince: r.updatedAt }] : [];
  });
}
// Unread TD notices for the Overview card and the sidebar count.
export async function tdNotices(actor: Actor) {
  const notices = await db.notification.findMany({
    where: { userId: actor.id, readAt: null, resourceId: { not: null }, link: { startsWith: "/dashboard/movement/td" } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const rows = await db.tdRequest.findMany({ where: { AND: [{ id: { in: notices.map((n) => n.resourceId!) } }, tdScope(actor)] } });
  const shown = new Map((await present(actor, rows)).map((r) => [r.id, r]));
  return notices.flatMap((n) => {
    const td = shown.get(n.resourceId!);
    return td ? [{ id: n.id, tdId: td.id, message: n.message, link: n.link!, at: n.createdAt, td }] : [];
  });
}
export async function markTdSeen(actor: Actor, id: string) {
  await db.notification.updateMany({ where: { userId: actor.id, resourceId: id, readAt: null }, data: { readAt: new Date() } });
}
// What the New TD form offers: the actor's own posts, and the people and
// formations they may send (within their officer posts' reach).
export async function tdOptions(actor: Actor) {
  const senders = officerPosts(actor);
  const live = { ...liveAssignments(), level: { in: [...LEVELS] } };
  const postInclude = { appointment: true, unit: true, group: true, directorate: true } satisfies Prisma.RoleAssignmentInclude;
  type Post = Prisma.RoleAssignmentGetPayload<{ include: typeof postInclude }>;
  const formation = (p: Post) => (p.unit ?? p.group ?? p.directorate)?.name ?? "";
  const [own, people] = await Promise.all([
    db.roleAssignment.findMany({ where: { userId: actor.id, ...live }, include: postInclude, orderBy: { startsAt: "asc" } }),
    senders.length
      ? db.roleAssignment.findMany({
          where: { AND: [live, { userId: { not: actor.id }, user: { active: true } }, assignmentsWithin({ ...actor, assignments: senders }, "read")] },
          include: { ...postInclude, ...assignmentInclude, user: { select: { name: true, assignments: { where: live, include: assignmentInclude } } } },
          orderBy: { user: { name: "asc" } },
          take: 300,
        })
      : [],
  ]);
  const keys = (k: "unitId" | "groupId" | "directorateId") => senders.filter((a) => reachKey(a.role) === k).map((a) => a.anchor[k]!).filter(Boolean);
  const [dtes, groups, units] = [keys("directorateId"), keys("groupId"), keys("unitId")];
  const named = { orderBy: { name: "asc" as const } };
  const [unitRows, groupRows, dteRows] = await Promise.all([
    db.unit.findMany({ where: { OR: [{ id: { in: units } }, { groupId: { in: groups } }, { group: { directorateId: { in: dtes } } }] }, select: { id: true, name: true, groupId: true, group: { select: { directorateId: true } } }, ...named }),
    db.group.findMany({ where: { OR: [{ id: { in: groups } }, { directorateId: { in: dtes } }] }, select: { id: true, name: true, directorateId: true }, ...named }),
    db.directorate.findMany({ where: { id: { in: dtes } }, select: { id: true, name: true }, ...named }),
  ]);
  // Formations where the actor may send a typed-in traveller.
  const typed = (level: string, anchor: Assignment["anchor"]) => senders.some((s) => canSend(s, { level, appointmentCode: null, anchor }));
  const none = { institutionId: null, unitId: null, groupId: null };
  const UNIT = unitRows.filter((u) => typed("UNIT", { ...none, unitId: u.id, groupId: u.groupId, directorateId: u.group.directorateId })).map(({ id, name }) => ({ id, name }));
  const GROUP = groupRows.filter((g) => typed("GROUP", { ...none, groupId: g.id, directorateId: g.directorateId })).map(({ id, name }) => ({ id, name }));
  const DIRECTORATE = dteRows.filter((d) => typed("DIRECTORATE", { ...none, directorateId: d.id }));
  const sendable = people.filter((p) => canSendPost(senders, toAssignment(p), p.user.assignments.map(toAssignment)));
  return {
    ownPosts: own.map((p) => ({ id: p.id, title: p.appointment?.title ?? "", formation: formation(p), level: p.level })),
    people: sendable.map((p) => ({ postId: p.id, name: p.user.name, post: p.appointment?.title ?? "", formation: formation(p) })),
    formations: { UNIT, GROUP, DIRECTORATE },
    canSend: sendable.length > 0 || UNIT.length + GROUP.length + DIRECTORATE.length > 0,
  };
}
