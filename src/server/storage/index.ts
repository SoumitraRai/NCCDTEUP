import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { db } from "../db";
import {
  AppError,
  claimScope,
  scope,
  requireInstitution,
  type Actor,
} from "../authorization";
import { audit } from "@/modules/audit";
export const storage = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
});
export const privateBucket = process.env.S3_PRIVATE_BUCKET ?? "sampark-private";
export const publicBucket = process.env.S3_PUBLIC_BUCKET ?? "sampark-public";
async function authorizeResource(
  actor: Actor,
  resourceType: string,
  resourceId: string,
  institutionId: string,
) {
  await requireInstitution(actor, institutionId, "read");
  const found =
    resourceType === "claim"
      ? await db.claim.findFirst({
          where: {
            AND: [{ id: resourceId, institutionId }, claimScope(actor)],
          },
        })
      : resourceType === "visit"
        ? await db.visit.findFirst({
            where: {
              id: resourceId,
              institutionId,
              institution: scope(actor, "read"),
              ...(actor.assignments.every((a) => a.role === "CADET")
                ? { ownerId: actor.id }
                : {}),
            },
          })
        : await db.publication.findFirst({
            where: {
              id: resourceId,
              institutionId,
              ...(actor.assignments.every((a) => a.role === "CADET")
                ? { ownerId: actor.id }
                : {}),
            },
          });
  if (!found) throw new AppError(404, "Resource not found.");
}
export async function uploadIntent(actor: Actor, raw: unknown) {
  const input = z
    .object({
      institutionId: z.string(),
      resourceType: z.enum(["claim", "visit", "publication"]),
      resourceId: z.string(),
      declaredType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
      size: z
        .number()
        .int()
        .positive()
        .max(10 * 1024 * 1024),
      purpose: z.enum(["", "BILL", "PHOTO", "DOCUMENT"]).default(""),
    })
    .strict()
    .parse(raw);
  if (input.purpose === "PHOTO") {
    if (input.declaredType === "application/pdf")
      throw new AppError(400, "Training photos must be JPEG or PNG.");
    if (
      (await db.attachment.count({
        where: { resourceId: input.resourceId, purpose: "PHOTO", status: { not: "REJECTED" } },
      })) >= 4
    )
      throw new AppError(400, "At most 4 training photos can be attached.");
  }
  await authorizeResource(
    actor,
    input.resourceType,
    input.resourceId,
    input.institutionId,
  );
  if (
    (await db.attachment.count({ where: { resourceId: input.resourceId } })) >=
    12
  )
    throw new AppError(400, "Attachment limit reached.");
  const asset = await db.attachment.create({
    data: {
      ...input,
      ownerId: actor.id,
      objectKey: `quarantine/${crypto.randomUUID()}`,
    },
  });
  const url = await getSignedUrl(
    storage,
    new PutObjectCommand({
      Bucket: privateBucket,
      Key: asset.objectKey,
      ContentType: input.declaredType,
      ContentLength: input.size,
    }),
    { expiresIn: 90 },
  );
  return { id: asset.id, url, expiresIn: 90 };
}
export async function completeUpload(actor: Actor, raw: unknown) {
  const { id } = z.object({ id: z.string() }).strict().parse(raw);
  const a = await db.attachment.findFirst({
    where: { id, ownerId: actor.id, status: "QUARANTINED" },
  });
  if (!a) throw new AppError(404, "Upload not found.");
  await authorizeResource(actor, a.resourceType, a.resourceId, a.institutionId);
  const head = await storage.send(
    new HeadObjectCommand({ Bucket: privateBucket, Key: a.objectKey }),
  );
  if (head.ContentLength !== a.size)
    throw new AppError(400, "Uploaded size does not match.");
  return db.$transaction(async (tx) => {
    const updated = await tx.attachment.updateMany({
      where: { id, status: "QUARANTINED" },
      data: { status: "SCANNING" },
    });
    if (updated.count)
      await tx.job.create({ data: { kind: "SCAN", resourceId: id } });
    return { status: "SCANNING" };
  });
}
export async function downloadAttachment(actor: Actor, id: string) {
  const a = await db.attachment.findUnique({ where: { id } });
  if (!a) throw new AppError(404, "Attachment not found.");
  await authorizeResource(actor, a.resourceType, a.resourceId, a.institutionId);
  if (a.status !== "CLEAN")
    throw new AppError(409, "Attachment is not cleared for download.");
  await db.$transaction((tx) => audit(tx, actor.id, "attachment.download", id));
  return {
    url: await getSignedUrl(
      storage,
      new GetObjectCommand({
        Bucket: privateBucket,
        Key: a.objectKey,
        ResponseContentDisposition: "attachment",
        ResponseContentType: "application/octet-stream",
      }),
      { expiresIn: 60 },
    ),
    expiresIn: 60,
  };
}

export async function listAttachments(actor:Actor,resourceType:string,resourceId:string,institutionId:string){await authorizeResource(actor,resourceType,resourceId,institutionId);return db.attachment.findMany({where:{resourceType,resourceId,institutionId},select:{id:true,status:true,declaredType:true,size:true,createdAt:true},orderBy:{createdAt:'desc'}});}
export async function uploadBytes(actor:Actor,id:string,request:Request){const asset=await db.attachment.findFirst({where:{id,ownerId:actor.id,status:'QUARANTINED'}});if(!asset)throw new AppError(404,'Upload not found.');await authorizeResource(actor,asset.resourceType,asset.resourceId,asset.institutionId);const reader=request.body?.getReader();if(!reader)throw new AppError(400,'File body required.');let size=0;const chunks:Uint8Array[]=[];while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>asset.size||size>10*1024*1024){await reader.cancel();throw new AppError(413,'File exceeds size limit.');}chunks.push(part.value);}if(size!==asset.size)throw new AppError(400,'File size mismatch.');await storage.send(new PutObjectCommand({Bucket:privateBucket,Key:asset.objectKey,Body:Buffer.concat(chunks),ContentType:asset.declaredType}));return completeUpload(actor,{id});}
