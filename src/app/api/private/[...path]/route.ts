import { z } from "zod";
import { db } from "@/server/db";
import {
  actorFrom,
  assignmentsWithin,
  AppError,
  claimScope,
  scope,
  requireInstitution,
  requireCapability,
} from "@/server/authorization";
import { csrf, failure, json, localeOf } from "@/server/http";
import {
  createClaim,
  transitionClaim,
  recordPayment,
} from "@/modules/finance/service";
import {
  createPublication,
  transitionPublication,
} from "@/modules/publications/service";
import {
  calculate,
  claimInput,
  csvCell,
  dateOnly,
} from "@/modules/finance/calculation";
import { audit } from "@/modules/audit";
import { approveMedia } from "@/modules/media/service";
import {
  uploadIntent,
  uploadBytes,
  listAttachments,
  completeUpload,
  downloadAttachment,
} from "@/server/storage";
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, context: Context) {
  try {
    const actor = await actorFrom(request.headers);
    const { path } = await context.params;
    const url = new URL(request.url);
    const page = Math.max(
      1,
      Math.min(10000, Number(url.searchParams.get("page")) || 1),
    );
    const search = (url.searchParams.get("q") ?? "").slice(0, 100);
    const institutions = await db.institution.findMany({
      where: scope(actor, "read"),
      select: { id: true, name: true, district: true },
    });
    const ids = institutions.map((i) => i.id);
    switch (path[0]) {
      case "summary": {const where=claimScope(actor);const [totals,pending]=await db.$transaction([db.claim.aggregate({where,_sum:{totalPaise:true,paidPaise:true},_count:true}),db.claim.count({where:{AND:[where,{state:{in:["SUBMITTED","UNDER_REVIEW"]}}]}})]);return json({count:totals._count,totalPaise:totals._sum.totalPaise??0n,paidPaise:totals._sum.paidPaise??0n,pending});}
      case "me":
        return json({
          id: actor.id,
          name: actor.name,
          roles: actor.assignments.map((a) => a.role),
          capabilities: actor.assignments.flatMap((a) => a.capabilities),
          institutions,
        });
      case "claims": {
        const where = {
          AND: [
            claimScope(actor),
            ...(path[1] ? [{ id: path[1] }] : []),
            ...(search
              ? [
                  {
                    OR: [
                      { id: { contains: search } },
                      { category: { contains: search } },
                    ],
                  },
                ]
              : []),
            ...(url.searchParams.get("state")
              ? [{ state: url.searchParams.get("state")! }]
              : []),
          ],
        };
        const [rows, total] = await db.$transaction([
          db.claim.findMany({
            where,
            include: {
              institution: { select: { name: true } },
              payments: true,
              approvals: true,
            },
            orderBy: {
              createdAt:
                url.searchParams.get("sort") === "oldest" ? "asc" : "desc",
            },
            skip: (page - 1) * 10,
            take: 10,
          }),
          db.claim.count({ where }),
        ]);
        if (path[1] && !rows.length)
          throw new AppError(404, "Claim not found.");
        return json({ rows, total, page });
      }
      case "export": {
        const rows = await db.claim.findMany({
          where: claimScope(actor),
          select: {
            id: true,
            kind: true,
            state: true,
            totalPaise: true,
            paidPaise: true,
          },
          take: 10000,
        });
        await db.$transaction((tx) =>
          audit(tx, actor.id, "claims.export", "claims", {
            count: rows.length,
          }),
        );
        return new Response(
          [
            "ID,Kind,State,Total paise,Paid paise",
            ...rows.map((r) =>
              Object.values(r)
                .map((v) => csvCell(String(v)))
                .join(","),
            ),
          ].join("\r\n"),
          {
            headers: {
              "Content-Type": "text/csv",
              "Content-Disposition": 'attachment; filename="claims.csv"',
              "Cache-Control": "private, no-store",
            },
          },
        );
      }
      case "publications":
        return json(
          await db.publication.findMany({
            where: {
              institutionId: { in: ids },
              ...(actor.assignments.every((a) => a.role === "CADET")
                ? { ownerId: actor.id }
                : {}),
            },
            include: { revisions: { orderBy: { number: "desc" }, take: 1 } },
            orderBy: { createdAt: "desc" },
            take: 100,
          }),
        );
      case "policies":
        requireCapability(actor, "review");
        return json(
          await db.financialRatePolicy.findMany({
            orderBy: { effectiveFrom: "desc" },
          }),
        );
      case "audit":
        requireCapability(actor, "audit");
        return json(
          await db.auditEvent.findMany({
            orderBy: { createdAt: "desc" },
            take: 100,
          }),
        );
      case "notices":
        return json(
          await db.notice.findMany({
            where: {
              institutionId: { in: ids },
              status: "PUBLISHED",
              publishAt: { lte: new Date() },
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            take: 100,
          }),
        );
      case "discussions":
        return json(
          await db.discussion.findMany({
            where: { institutionId: { in: ids } },
            orderBy: { createdAt: "desc" },
            take: 100,
          }),
        );
      case "notifications":
        return json(
          await db.notification.findMany({
            where: { userId: actor.id },
            orderBy: { createdAt: "desc" },
            take: 50,
          }),
        );
      case "profile":
        return json({
          name: actor.name,
          preferences: await db.notificationPreference.findUnique({
            where: { userId: actor.id },
          }),
        });
      case "users":
        requireCapability(actor, "admin");
        return json(
          await db.user.findMany({
            where: { assignments: { some: assignmentsWithin(actor, "admin") } },
            select: {
              id: true,
              name: true,
              active: true,
              assignments: {
                select: {
                  id: true,
                  role: true,
                  institutionId: true,
                  active: true,
                },
              },
            },
          }),
        );
      case "attachments":
        if(!path[1])return json(await listAttachments(actor,url.searchParams.get("resourceType")??"",url.searchParams.get("resourceId")??"",url.searchParams.get("institutionId")??""));
        if (!path[1]) throw new AppError(404, "Attachment not found.");
        return json(await downloadAttachment(actor, path[1]));
      default:
        throw new AppError(404, "Not found.");
    }
  } catch (e) {
    return failure(e, localeOf(request));
  }
}
export async function POST(request: Request, context: Context) {
  try {
    csrf(request);
    const actor = await actorFrom(request.headers);
    const { path } = await context.params;
    const body: unknown = await request.json();
    switch (path.join("/")) {
      case "claims":
        return json(await createClaim(actor, body), 201);
      case "claims/transition":
        return json(await transitionClaim(actor, body));
      case "claims/payment":
        return json(await recordPayment(actor, body));
      case "claims/preview": {
        const input = claimInput.parse(body);
        await requireInstitution(actor, input.institutionId, "edit");
        if (
          !(await db.institution.findFirst({
            where: {
              AND: [
                { id: input.institutionId },
                { claims: { some: claimScope(actor) } },
              ],
            },
          })) &&
          actor.assignments.every((a) => a.role === "CADET")
        )
          throw new AppError(403, "Not permitted.");
        try {
          return json(
            calculate(
              input,
              await db.financialRatePolicy.findMany(),
              process.env.APP_MODE === "production",
            ),
          );
        } catch (e) {
          throw new AppError(
            400,
            e instanceof Error ? e.message : "Invalid calculation.",
          );
        }
      }
      case "claims/correct": {
        const input = claimInput
          .extend({ id: z.string(), version: z.number().int() })
          .parse(body);
        await requireInstitution(actor, input.institutionId, "edit");
        const { id, version, ...data } = input;
        const changed = await db.claim.updateMany({
          where: {
            AND: [
              {
                id,
                ownerId: actor.id,
                version,
                state: { in: ["DRAFT", "RETURNED"] },
              },
              claimScope(actor, "edit"),
            ],
          },
          data: {
            ...data,
            periodStart: new Date(data.periodStart),
            periodEnd: new Date(data.periodEnd),
            version: { increment: 1 },
          },
        });
        if (!changed.count) throw new AppError(409, "Draft not editable.");
        return json({ updated: true });
      }
      case "publications":
        return json(await createPublication(actor, body), 201);
      case "publications/transition":
        return json(await transitionPublication(actor, body));
      case "consents": {
        const input = z
          .object({
            publicationId: z.string(),
            evidenceAttachmentId: z.string().optional(),
            guardianRequired: z.boolean(),
            guardianConfirmed: z.boolean(),
            permissionConfirmed: z.literal(true),
          })
          .strict()
          .parse(body);
        const publication = await db.publication.findUnique({
          where: { id: input.publicationId },
        });
        if (!publication) throw new AppError(404, "Publication not found.");
        await requireInstitution(actor, publication.institutionId, "review");
        if (!["DRAFT", "RETURNED"].includes(publication.status))
          throw new AppError(
            409,
            "Permission can only be attached to an editable revision.",
          );
        return json(
          await db.$transaction(async (tx) => {
            const consent = await tx.consentRecord.create({
              data: {
                ...input,
                recordedBy: actor.id,
                synthetic: process.env.APP_MODE !== "production",
              },
            });
            await tx.publicationRevision.update({
              where: { id: publication.currentRevisionId! },
              data: { consentId: consent.id },
            });
            await audit(tx, actor.id, "consent.recorded", publication.id);
            return consent;
          }),
        );
      }
      case "policies": {
        requireCapability(actor, "admin");
        const input = z
          .object({
            name: z.string().min(3).max(100),
            version: z.number().int().positive(),
            kind: z.enum(["REFRESHMENT", "HONORARIUM"]),
            category: z.string().min(1).max(60),
            effectiveFrom: dateOnly,
            effectiveTo: dateOnly,
            ratePaise: z.string().regex(/^[1-9]\d{0,9}$/),
            capPaise: z.string().regex(/^[1-9]\d{0,11}$/),
            partialMonthRule: z.enum([
              "ACTUAL_DAYS_HALF_UP_DAILY",
              "NOT_APPLICABLE",
            ]),
            approved: z.boolean(),
            synthetic: z.boolean(),
          })
          .strict()
          .parse(body);
        if (input.effectiveFrom > input.effectiveTo)
          throw new AppError(400, "Reversed policy dates.");
        return json(
          await db.$transaction(
            async (tx) => {
              if (
                await tx.financialRatePolicy.findFirst({
                  where: {
                    kind: input.kind,
                    category: input.category,
                    approved: true,
                    effectiveFrom: { lte: new Date(input.effectiveTo) },
                    effectiveTo: { gte: new Date(input.effectiveFrom) },
                  },
                })
              )
                throw new AppError(409, "Policy dates overlap.");
              const p = await tx.financialRatePolicy.create({
                data: {
                  ...input,
                  effectiveFrom: new Date(input.effectiveFrom),
                  effectiveTo: new Date(input.effectiveTo),
                  ratePaise: BigInt(input.ratePaise),
                  capPaise: BigInt(input.capPaise),
                },
              });
              await audit(tx, actor.id, "policy.created", p.id);
              return p;
            },
            { isolationLevel: "Serializable" },
          ),
        );
      }
      case "users/assign": {requireCapability(actor,"admin");const input=z.object({userId:z.string(),institutionId:z.string(),role:z.enum(["CADET","ANO","CO","GROUP","ADMIN"]),capabilities:z.array(z.enum(["publish","payment"])).max(2),startsAt:z.string().datetime(),endsAt:z.string().datetime().optional()}).strict().parse(body);if(input.userId===actor.id)throw new AppError(403,"Cannot change your own privileges.");await requireInstitution(actor,input.institutionId,"admin");if(input.endsAt&&new Date(input.endsAt)<=new Date(input.startsAt))throw new AppError(400,"End must follow start.");if(!await db.user.findFirst({where:{id:input.userId,assignments:{some:{institution:scope(actor,"admin")}}}}))throw new AppError(404,"User not found.");return json(await db.$transaction(async tx=>{const assignment=await tx.roleAssignment.create({data:{...input,startsAt:new Date(input.startsAt),endsAt:input.endsAt?new Date(input.endsAt):null}});await tx.session.deleteMany({where:{userId:input.userId}});await audit(tx,actor.id,"assignment.created",assignment.id);return assignment;}));}
      case "consents/revoke": {const input=z.object({id:z.string()}).strict().parse(body);const consent=await db.consentRecord.findUnique({where:{id:input.id}});if(!consent)throw new AppError(404,"Consent not found.");const publication=await db.publication.findUniqueOrThrow({where:{id:consent.publicationId}});await requireInstitution(actor,publication.institutionId,"publish");await db.$transaction(async tx=>{await tx.consentRecord.update({where:{id:consent.id},data:{revokedAt:new Date()}});await tx.publicContent.deleteMany({where:{publicationId:publication.id}});await tx.publication.update({where:{id:publication.id},data:{status:"WITHDRAWN",version:{increment:1}}});await audit(tx,actor.id,"consent.revoked",consent.id);});return json({withdrawn:true});}
      case "users/revoke": {
        requireCapability(actor, "admin");
        const input = z.object({ userId: z.string() }).strict().parse(body);
        if (input.userId === actor.id)
          throw new AppError(403, "Cannot change your own privileges.");
        const target = await db.user.findFirst({
          where: {
            id: input.userId,
            assignments: { some: { institution: scope(actor, "admin") } },
          },
        });
        if (!target) throw new AppError(404, "User not found.");
        await db.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: target.id },
            data: { active: false },
          });
          await tx.session.deleteMany({ where: { userId: target.id } });
          await audit(tx, actor.id, "user.revoked", target.id);
        });
        return json({ revoked: true });
      }
      case "discussions": {
        const input = z
          .object({
            institutionId: z.string(),
            body: z.string().min(1).max(2000),
          })
          .strict()
          .parse(body);
        await requireInstitution(actor, input.institutionId, "read");
        return json(
          await db.discussion.create({
            data: { ...input, authorId: actor.id },
          }),
          201,
        );
      }
      case "notices": {
        const input = z
          .object({
            institutionId: z.string(),
            title: z.string().min(3).max(160),
            body: z.string().min(3).max(5000),
            locale: z.enum(["en", "hi"]),
            publishAt: z.string().datetime(),
            expiresAt: z.string().datetime(),
          })
          .strict()
          .parse(body);
        await requireInstitution(actor, input.institutionId, "review");
        if (new Date(input.expiresAt) <= new Date(input.publishAt))
          throw new AppError(400, "Expiration must follow publication.");
        return json(
          await db.notice.create({
            data: {
              ...input,
              audience: "INTERNAL",
              category: "GENERAL",
              translationGroupId: crypto.randomUUID(),
              authorId: actor.id,
              reviewerId: actor.id,
              status: "PUBLISHED",
            },
          }),
          201,
        );
      }
      case "profile": {
        const input = z.object({ inApp: z.boolean() }).strict().parse(body);
        return json(
          await db.notificationPreference.upsert({
            where: { userId: actor.id },
            create: { userId: actor.id, ...input },
            update: input,
          }),
        );
      }
      case "media/approve":
        return json(await approveMedia(actor, body));
      case "attachments/intent":
        return json(await uploadIntent(actor, body), 201);
      case "attachments/complete":
        return json(await completeUpload(actor, body));
      default:
        throw new AppError(404, "Not found.");
    }
  } catch (e) {
    return failure(e, localeOf(request));
  }
}

export async function PUT(request:Request,context:Context){try{csrf(request);const actor=await actorFrom(request.headers);const {path}=await context.params;if(path[0]!=="attachments"||!path[1])throw new AppError(404,"Not found.");return json(await uploadBytes(actor,path[1],request));}catch(e){return failure(e, localeOf(request))}}
