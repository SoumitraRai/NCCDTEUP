import sharp from "sharp";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { db } from "@/server/db";
import { storage, privateBucket, publicBucket } from "@/server/storage";
import {
  AppError,
  requireInstitution,
  type Actor,
} from "@/server/authorization";
import { audit } from "@/modules/audit";
export function safeCaption(text: string) {
  if (
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:\+?\d[\s-]*){10,}|\b(?:gps|latitude|longitude)\s*[:=]/i.test(
      text,
    )
  )
    throw new AppError(
      400,
      "Remove contact details or precise coordinates from public text.",
    );
  return text;
}
export async function approveMedia(actor: Actor, raw: unknown) {
  const input = z
    .object({
      attachmentId: z.string(),
      publicationId: z.string(),
      caption: z.string().min(3).max(300),
    })
    .strict()
    .parse(raw);
  safeCaption(input.caption);
  const p = await db.publication.findUnique({
    where: { id: input.publicationId },
  });
  if (!p) throw new AppError(404, "Publication not found.");
  await requireInstitution(actor, p.institutionId, "publish");
  if (!["DRAFT", "RETURNED"].includes(p.status))
    throw new AppError(409, "Media can only be attached to a draft revision.");
  const attachment = await db.attachment.findFirst({
    where: {
      id: input.attachmentId,
      resourceType: "publication",
      resourceId: p.id,
      status: "CLEAN",
      declaredType: { in: ["image/jpeg", "image/png"] },
    },
  });
  if (!attachment)
    throw new AppError(
      400,
      "A clean image bound to this publication is required.",
    );
  const source = await storage.send(
    new GetObjectCommand({ Bucket: privateBucket, Key: attachment.objectKey }),
  );
  const bytes = await source.Body!.transformToByteArray();
  const derivative = await sharp(bytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer();
  const key = `approved/${crypto.randomUUID()}.webp`;
  await storage.send(
    new PutObjectCommand({
      Bucket: publicBucket,
      Key: key,
      Body: derivative,
      ContentType: "image/webp",
    }),
  );
  return db.$transaction(
    async (tx) => {
      const current = await tx.publication.findUniqueOrThrow({
        where: { id: p.id },
      });
      if (
        current.version !== p.version ||
        !["DRAFT", "RETURNED"].includes(current.status)
      )
        throw new AppError(409, "Publication changed.");
      const asset = await tx.mediaAsset.create({
        data: {
          attachmentId: attachment.id,
          publicKey: key,
          caption: input.caption,
          status: "APPROVED",
        },
      });
      await tx.publicationRevision.update({
        where: { id: p.currentRevisionId! },
        data: { mediaIds: { push: asset.id } },
      });
      await tx.publication.update({
        where: { id: p.id },
        data: { version: { increment: 1 } },
      });
      await audit(tx, actor.id, "media.approved", asset.id);
      return asset;
    },
    { isolationLevel: "Serializable" },
  );
}
