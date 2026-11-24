import "dotenv/config";
import net from "node:net";
import { fileURLToPath } from "node:url";
import {
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { db } from "../db";
import { storage, privateBucket } from "../storage";
import { deliverQueuedMail } from "../mail";
export function detectType(bytes: Buffer) {
  if (bytes.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  return null;
}
export async function scan(bytes: Buffer) {
  return new Promise<void>((resolve, reject) => {
    const client = net.createConnection({
      host: process.env.CLAMAV_HOST ?? "127.0.0.1",
      port: Number(process.env.CLAMAV_PORT ?? 3310),
    });
    let response = "";
    client.setTimeout(30000, () => client.destroy(new Error("SCAN_TIMEOUT")));
    client.on("error", reject);
    client.on("data", (chunk) => (response += chunk.toString()));
    client.on("end", () =>
      response.includes("stream: OK")
        ? resolve()
        : reject(new Error("SCAN_REJECTED")),
    );
    client.on("connect", () => {
      client.write("zINSTREAM\0");
      for (let i = 0; i < bytes.length; i += 65536) {
        const chunk = bytes.subarray(i, i + 65536);
        const length = Buffer.alloc(4);
        length.writeUInt32BE(chunk.length);
        client.write(length);
        client.write(chunk);
      }
      client.write(Buffer.alloc(4));
    });
  });
}
export async function tick() {
  await db.job.updateMany({
    where: {
      status: "RUNNING",
      lockedAt: { lt: new Date(Date.now() - 5 * 60_000) },
    },
    data: { status: "PENDING" },
  });
  const jobs = await db.$transaction(
    async (tx) =>
      tx.$queryRaw<
        { id: string; resourceId: string; kind: string; attempts: number }[]
      >`UPDATE "Job" SET status='RUNNING', "lockedAt"=NOW(), attempts=attempts+1 WHERE id IN (SELECT id FROM "Job" WHERE status='PENDING' AND "runAt"<=NOW() ORDER BY "runAt" FOR UPDATE SKIP LOCKED LIMIT 5) RETURNING id,"resourceId",kind,attempts`,
  );
  for (const job of jobs) {
    try {
      if (job.kind === "SCAN") {
        const asset = await db.attachment.findUniqueOrThrow({
          where: { id: job.resourceId },
        });
        const result = await storage.send(
          new GetObjectCommand({ Bucket: privateBucket, Key: asset.objectKey }),
        );
        if (
          !result.ContentLength ||
          result.ContentLength !== asset.size ||
          result.ContentLength > 10 * 1024 * 1024
        )
          throw new Error("SIZE_REJECTED");
        const bytes = Buffer.from(await result.Body!.transformToByteArray());
        if (detectType(bytes) !== asset.declaredType)
          throw new Error("TYPE_REJECTED");
        if (
          asset.declaredType === "application/pdf" &&
          /\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA)\b/.test(
            bytes.toString("latin1"),
          )
        )
          throw new Error("ACTIVE_CONTENT_REJECTED");
        await scan(bytes);
        const cleanKey = `clean/${crypto.randomUUID()}`;
        await storage.send(
          new PutObjectCommand({
            Bucket: privateBucket,
            Key: cleanKey,
            Body: bytes,
            ContentType: asset.declaredType,
          }),
        );
        await db.attachment.update({
          where: { id: asset.id },
          data: { objectKey: cleanKey, status: "CLEAN", scannedAt: new Date() },
        });
      }
      await db.job.update({
        where: { id: job.id },
        data: { status: "DONE", errorCode: null },
      });
    } catch {
      await db.job.update({
        where: { id: job.id },
        data: {
          status: job.attempts >= 3 ? "FAILED" : "PENDING",
          runAt: new Date(Date.now() + 60_000),
          errorCode: "PROCESSING_FAILED",
        },
      });
      if (job.attempts >= 3)
        await db.attachment.updateMany({
          where: { id: job.resourceId },
          data: { status: "REJECTED" },
        });
    }
  }
  await db.notice.updateMany({
    where: { status: "PUBLISHED", expiresAt: { lte: new Date() } },
    data: { status: "ARCHIVED" },
  });
  await db.publicContent.updateMany({
    where: { archived: false, expiresAt: { lte: new Date() } },
    data: { archived: true },
  });
  await db.recruitmentEnquiry.deleteMany({
    where: { deleteAfter: { lt: new Date() } },
  });
  // Pending requests hold a password hash; expired ones go with it.
  await db.registrationRequest.deleteMany({
    where: { deleteAfter: { lt: new Date() } },
  });
  await db.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await deliverQueuedMail();
  await db.outboundEmail.deleteMany({ where: { deleteAfter: { lt: new Date() } } });
  const orphans = await db.attachment.findMany({
    where: {
      status: "QUARANTINED",
      createdAt: { lt: new Date(Date.now() - 24 * 3600_000) },
    },
    take: 50,
  });
  for (const a of orphans) {
    await storage.send(
      new DeleteObjectCommand({ Bucket: privateBucket, Key: a.objectKey }),
    );
    await db.attachment.update({
      where: { id: a.id },
      data: { status: "EXPIRED" },
    });
  }
  // Files that failed scanning are never served, so their bytes are deleted.
  // The row stays (status REJECTED) so the bill shows "Blocked by scan";
  // scannedAt records when the verdict was reached and the bytes removed.
  const rejected = await db.attachment.findMany({
    where: { status: "REJECTED", scannedAt: null },
    take: 50,
  });
  for (const a of rejected) {
    await storage.send(
      new DeleteObjectCommand({ Bucket: privateBucket, Key: a.objectKey }),
    );
    await db.attachment.update({
      where: { id: a.id },
      data: { scannedAt: new Date() },
    });
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const run = async () => {
    try {
      await tick();
    } catch {
      console.error(JSON.stringify({ event: "worker_tick_failed" }));
    }
  };
  await run();
  setInterval(run, 10000);
}
