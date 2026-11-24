import { route } from "@/server/http";
import { resolveTrainingYear } from "@/modules/platform/training-year";
export const GET = route(async () => {
  const { year, years } = await resolveTrainingYear();
  return { current: year.label, years };
});
