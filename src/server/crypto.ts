import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
// Restricted personal fields (phone numbers, account numbers) are stored as
// AES-256-GCM ciphertext: "v1.<iv>.<tag>.<data>", each part base64url.
function key() {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  const k = raw ? Buffer.from(raw, "base64") : null;
  if (!k || k.length !== 32)
    throw new Error("FIELD_ENCRYPTION_KEY must be 32 bytes, base64 encoded.");
  return k;
}
export function encryptField(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}
export function decryptField(stored: string) {
  const [v, iv, tag, data] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !data)
    throw new Error("Unrecognized ciphertext.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
export const maskPhone = (phone: string) =>
  phone.length > 4 ? `${"•".repeat(phone.length - 4)}${phone.slice(-4)}` : "••••";
