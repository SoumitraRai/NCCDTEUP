import { afterAll, describe, it, expect } from "vitest";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "../src/server/db";
import { storage, privateBucket } from "../src/server/storage";
import { detectType, tick } from "../src/server/jobs/worker";
const ids: string[] = [];
const exists = (Key: string) => storage.send(new HeadObjectCommand({ Bucket: privateBucket, Key })).then(() => true, () => false);
afterAll(async () => {
  await db.attachment.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});
describe("upload worker", () => {
  it("recognises file types by their bytes, not their name", () => {
    expect(detectType(Buffer.from("%PDF-1.7"))).toBe("application/pdf");
    expect(detectType(Buffer.from([255, 216, 255, 224]))).toBe("image/jpeg");
    expect(detectType(Buffer.from("plain text"))).toBeNull();
  });
  it("deletes the bytes of a rejected upload once and keeps its record", async () => {
    const key = `test/${crypto.randomUUID()}`;
    await storage.send(new PutObjectCommand({ Bucket: privateBucket, Key: key, Body: "x" }));
    const a = await db.attachment.create({
      data: { ownerId: "ano", institutionId: "institution-1", resourceType: "claim", resourceId: "none", objectKey: key, declaredType: "image/png", size: 1, status: "REJECTED", purpose: "PHOTO" },
    });
    ids.push(a.id);
    await tick();
    const after = await db.attachment.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.status).toBe("REJECTED");
    expect(after.scannedAt).not.toBeNull();
    expect(await exists(key)).toBe(false);
  });
});
