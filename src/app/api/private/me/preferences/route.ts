import { z } from "zod";
import { route } from "@/server/http";
import { db } from "@/server/db";
import { audit } from "@/modules/audit";
export const GET = route(async ({ actor }) =>
  db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { autoRecommend: true } }),
);
// "System R": recommend automatically at stages this user holds.
export const PATCH = route(async ({ actor, body }) => {
  const input = z.object({ autoRecommend: z.boolean() }).strict().parse(await body());
  return db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.id }, data: input });
    await audit(tx, actor.id, input.autoRecommend ? "preference.system_r.on" : "preference.system_r.off", actor.id);
    return input;
  });
});
