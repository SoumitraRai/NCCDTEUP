import { describe, it, expect } from "vitest";
import { z } from "zod";
import { AppError } from "../src/server/authorization";
import { failure } from "../src/server/http";
import { toHindi } from "../src/server/messages-hi";
const body = async (r: Response) => (await r.json()) as { error: string; issues?: { message: string }[] };
describe("server messages in Hindi", () => {
  it("translates known messages and patterns, and leaves unknown ones in English", () => {
    expect(toHindi("Not permitted for this unit.")).toBe("इस यूनिट के लिए अनुमति नहीं है।");
    expect(toHindi("The longitude must be between 68 and 98.")).toBe("देशांतर 68 और 98 के बीच होना चाहिए।");
    expect(toHindi("Something new.")).toBe("Something new.");
    expect(toHindi("This step awaits the Group Commander.")).toBe("यह चरण ग्रुप कमांडर की प्रतीक्षा में है।");
    expect(toHindi("The Commanding Officer cannot approve at this step.")).toBe("कमांडिंग ऑफिसर इस चरण पर स्वीकृति नहीं कर सकते।");
  });
  it("answers in the requested language and keeps the status", async () => {
    const hi = failure(new AppError(403, "Not permitted."), "hi");
    expect(hi.status).toBe(403);
    expect((await body(hi)).error).toBe("अनुमति नहीं है।");
    expect((await body(failure(new AppError(403, "Not permitted.")))).error).toBe("Not permitted.");
    const parsed = z.object({ unitId: z.string().min(1, "Choose a unit.") }).safeParse({ unitId: "" });
    const zod = await body(failure(parsed.error, "hi"));
    expect(zod.error).toBe("चिह्नित फ़ील्ड जाँचें।");
    expect(zod.issues?.[0].message).toBe("यूनिट चुनें।");
  });
});
