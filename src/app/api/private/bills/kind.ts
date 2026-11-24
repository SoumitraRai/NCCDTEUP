import { AppError } from "@/server/authorization";
import type { BillKind } from "@/modules/bills/service";
export function billKind(kind: string): BillKind {
  if (kind === "refreshment") return "REFRESHMENT";
  if (kind === "honorarium") return "HONORARIUM";
  throw new AppError(404, "Not found.");
}
