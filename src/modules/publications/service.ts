import { z } from "zod";
import { db } from "@/server/db";
import {
  AppError,
  requireInstitution,
  scope,
  separateDuties,
  type Actor,
} from "@/server/authorization";
import { audit } from "@/modules/audit";
import { safeCaption } from "@/modules/media/service";
import { dateOnly } from "@/modules/finance/calculation";
export const publicSelect = {
  publicId: true,
  slug: true,
  category: true,
  title: true,
  summary: true,
  locale: true,
  institutionDisplayName: true,
  district: true,
  eventDate: true,
  publicationDate: true,
  publishAt: true,
  expiresAt: true,
  archived: true,
  media: true,
} as const;
export async function publicContent(
  locale: string,
  category?: string,
  archived = false,
) {
  const now = new Date();
  return db.publicContent.findMany({
    where: {
      locale,
      ...(category ? { category } : {}),
      publishAt: { lte: now },
      ...(archived
        ? { OR: [{ archived: true }, { expiresAt: { lte: now } }] }
        : {
            archived: false,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          }),
    },
    select: publicSelect,
    orderBy: { publicationDate: "desc" },
    take: 60,
  });
}
export const publicationInput = z
  .object({
    institutionId: z.string(),
    slug: z.string().regex(/^[a-z0-9-]{3,100}$/),
    category: z.enum(["VISIT", "ACHIEVEMENT", "ACTIVITY", "GALLERY", "NOTICE"]),
    title: z.string().min(3).max(160),
    summary: z.string().min(10).max(5000),
    locale: z.enum(["en", "hi"]),
    institutionDisplayName: z.string().min(3).max(160),
    district: z.string().min(2).max(80),
    eventDate: dateOnly,
    publishAt: z.string().datetime(),
    expiresAt: z.string().datetime().optional(),
    consentId: z.string().optional(),
    mediaIds: z.array(z.string()).max(12).default([]),
  })
  .strict();
export async function createPublication(actor: Actor, raw: unknown) {
  const input = publicationInput.parse(raw);
  safeCaption(input.title);
  safeCaption(input.summary);
  await requireInstitution({...actor,assignments:actor.assignments.filter(a=>a.role!=="CADET")}, input.institutionId, "edit");
  if (!actor.assignments.some((a) => a.role !== "CADET"))
    throw new AppError(403, "Publication drafting requires staff access.");
  return db.$transaction(async (tx) => {
    const p = await tx.publication.create({
      data: {
        slug: input.slug,
        category: input.category,
        institutionId: input.institutionId,
        ownerId: actor.id,
        revisions: {
          create: {
            number: 1,
            title: input.title,
            summary: input.summary,
            locale: input.locale,
            institutionDisplayName: input.institutionDisplayName,
            district: input.district,
            eventDate: new Date(input.eventDate),
            publishAt: new Date(input.publishAt),
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            consentId: input.consentId,
            mediaIds: input.mediaIds,
            authorId: actor.id,
          },
        },
      },
      include: { revisions: true },
    });
    await tx.publication.update({
      where: { id: p.id },
      data: { currentRevisionId: p.revisions[0].id },
    });
    await audit(tx, actor.id, "publication.draft", p.id);
    return p;
  });
}
export const publicationTransition = z
  .object({
    id: z.string(),
    version: z.number().int().positive(),
    action: z.enum([
      "SUBMIT",
      "APPROVE",
      "RETURN",
      "REJECT",
      "PUBLISH",
      "WITHDRAW",
      "ARCHIVE",
      "REVISE",
    ]),
    title: z.string().min(3).max(160).optional(),
    summary: z.string().min(10).max(5000).optional(),
  })
  .strict();
export async function transitionPublication(actor: Actor, raw: unknown) {
  const input = publicationTransition.parse(raw);
  if (input.title) safeCaption(input.title);
  if (input.summary) safeCaption(input.summary);
  const action = ["PUBLISH", "WITHDRAW", "ARCHIVE"].includes(input.action)
    ? "publish"
    : ["APPROVE", "RETURN", "REJECT"].includes(input.action)
      ? "review"
      : "edit";
  return db.$transaction(
    async (tx) => {
      const institutions = await tx.institution.findMany({
        where: scope(actor, action),
        select: { id: true },
      });
      const p = await tx.publication.findFirst({
        where: {
          id: input.id,
          institutionId: { in: institutions.map((i) => i.id) },
        },
        include: { revisions: { orderBy: { number: "desc" }, take: 1 } },
      });
      if (!p) throw new AppError(404, "Publication not found.");
      if (p.version !== input.version)
        throw new AppError(409, "Publication changed.");
      const r = p.revisions[0];
      const from: Record<string, string[]> = {
        SUBMIT: ["DRAFT", "RETURNED"],
        APPROVE: ["SUBMITTED"],
        RETURN: ["SUBMITTED"],
        REJECT: ["SUBMITTED"],
        PUBLISH: ["APPROVED"],
        WITHDRAW: ["PUBLISHED", "ARCHIVED", "APPROVED", "DRAFT", "SUBMITTED", "RETURNED", "REJECTED"],
        ARCHIVE: ["PUBLISHED"],
        REVISE: ["PUBLISHED", "ARCHIVED", "REJECTED", "RETURNED"],
      };
      if (!from[input.action].includes(p.status))
        throw new AppError(409, "Invalid publication transition.");
      if (["APPROVE", "RETURN", "REJECT", "PUBLISH"].includes(input.action))
        separateDuties(actor, r.authorId);
      const next = {
        SUBMIT: "SUBMITTED",
        APPROVE: "APPROVED",
        RETURN: "RETURNED",
        REJECT: "REJECTED",
        PUBLISH: "PUBLISHED",
        WITHDRAW: "WITHDRAWN",
        ARCHIVE: "ARCHIVED",
        REVISE: "DRAFT",
      }[input.action];
      let current = r.id;
      if (input.action === "REVISE") {
        const revision = await tx.publicationRevision.create({
          data: {
            publicationId: p.id,
            number: r.number + 1,
            title: input.title ?? r.title,
            summary: input.summary ?? r.summary,
            locale: r.locale,
            institutionDisplayName: r.institutionDisplayName,
            district: r.district,
            eventDate: r.eventDate,
            publishAt: r.publishAt,
            expiresAt: r.expiresAt,
            consentId: r.consentId,
            mediaIds: r.mediaIds,
            authorId: actor.id,
          },
        });
        current = revision.id;
      }
      if (input.action === "PUBLISH") {
        const consent = r.consentId
          ? await tx.consentRecord.findFirst({
              where: {
                id: r.consentId,
                publicationId: p.id,
                permissionConfirmed: true,
                revokedAt: null,
                OR: [{ guardianRequired: false }, { guardianConfirmed: true }],
                ...(process.env.APP_MODE === "production"
                  ? { synthetic: false, evidenceAttachmentId: { not: null } }
                  : {}),
              },
            })
          : null;
        if (!consent)
          throw new AppError(
            400,
            "Documented publication permission is required.",
          );
        if (
          process.env.APP_MODE === "production" &&
          consent.evidenceAttachmentId &&
          !(await tx.attachment.findFirst({
            where: {
              id: consent.evidenceAttachmentId,
              status: "CLEAN",
              resourceId: p.id,
            },
          }))
        )
          throw new AppError(
            400,
            "Consent evidence must be clean and bound to this publication.",
          );
        const media = await tx.mediaAsset.findMany({
          where: { id: { in: r.mediaIds }, status: "APPROVED" },
          select: { id: true, publicKey: true, caption: true },
        });
        if (media.length !== r.mediaIds.length)
          throw new AppError(
            400,
            "Every image needs an approved sanitized derivative.",
          );
        const projection = {
          slug: p.slug,
          category: p.category,
          title: r.title,
          summary: r.summary,
          locale: r.locale,
          institutionDisplayName: r.institutionDisplayName,
          district: r.district,
          eventDate: r.eventDate,
          publicationDate: new Date(),
          publishAt: r.publishAt ?? new Date(),
          expiresAt: r.expiresAt,
          archived: false,
          media: media.map((m) => ({
            url: `/api/public/media/${m.id}`,
            caption: m.caption,
          })),
        };
        await tx.publicContent.upsert({
          where: { publicationId: p.id },
          create: { publicationId: p.id, ...projection },
          update: projection,
        });
      }
      if (input.action === "WITHDRAW")
        await tx.publicContent.deleteMany({ where: { publicationId: p.id } });
      if (input.action === "ARCHIVE")
        await tx.publicContent.updateMany({
          where: { publicationId: p.id },
          data: { archived: true },
        });
      if (input.action !== "REVISE")
        await tx.publicationRevision.update({
          where: { id: r.id },
          data: {
            status: next,
            ...(input.action === "APPROVE" ? { reviewerId: actor.id } : {}),
          },
        });
      const changed = await tx.publication.updateMany({
        where: { id: p.id, version: input.version },
        data: {
          status: next,
          currentRevisionId: current,
          version: { increment: 1 },
        },
      });
      if (!changed.count) throw new AppError(409, "Publication changed.");
      await audit(
        tx,
        actor.id,
        `publication.${input.action.toLowerCase()}`,
        p.id,
      );
      return { id: p.id, status: next };
    },
    { isolationLevel: "Serializable" },
  );
}
