import type { Prisma } from "@prisma/client";
import nodemailer from "nodemailer";
import { db } from "./db";
// Mail is queued in OutboundEmail inside the caller's transaction and
// delivered by the worker. Delivery happens only when MAIL_DELIVERY=smtp:
// development points SMTP_URL at Mailpit; production delivery is a
// communication and stays off until it is explicitly authorized.
export function queueMail(tx: Prisma.TransactionClient, mail: { to: string; subject: string; text: string; ttlMs: number }) {
  return tx.outboundEmail.create({ data: { to: mail.to, subject: mail.subject, text: mail.text, deleteAfter: new Date(Date.now() + mail.ttlMs) } });
}
export const mailEnabled = () => process.env.MAIL_DELIVERY === "smtp" && !!process.env.SMTP_URL;
// Email confirmation is optional (off unless REQUIRE_EMAIL_VERIFICATION=true).
// Turn it on only once real mail delivery is authorized; until then nothing
// may depend on a person receiving an email.
export const emailVerificationRequired = () => process.env.REQUIRE_EMAIL_VERIFICATION === "true";
export async function deliverQueuedMail() {
  if (!mailEnabled()) return 0;
  const transport = nodemailer.createTransport(process.env.SMTP_URL!);
  const from = process.env.MAIL_FROM || "Sampark <no-reply@sampark.invalid>";
  const queued = await db.outboundEmail.findMany({ where: { status: "PENDING", deleteAfter: { gt: new Date() } }, orderBy: { createdAt: "asc" }, take: 20 });
  let sent = 0;
  for (const m of queued) {
    try {
      await transport.sendMail({ from, to: m.to, subject: m.subject, text: m.text });
      // The body may hold a one-time link; it is not kept after sending.
      await db.outboundEmail.update({ where: { id: m.id }, data: { status: "SENT", sentAt: new Date(), text: "" } });
      sent++;
    } catch {
      await db.outboundEmail.update({ where: { id: m.id }, data: { attempts: { increment: 1 }, status: m.attempts + 1 >= 5 ? "FAILED" : "PENDING" } });
    }
  }
  transport.close();
  return sent;
}
