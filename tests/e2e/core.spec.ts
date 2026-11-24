import { createHmac } from "node:crypto";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("public English and Hindi pages are usable and exclude private fields", async ({
  page,
  request,
}) => {
  await page.goto("/en");
  await expect(
    page.getByRole("heading", {
      name: "A shared purpose. A stronger tomorrow.",
    }),
  ).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "हिन्दी", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "साझा उद्देश्य। सशक्त भविष्य।" }),
  ).toBeVisible();
  const data = await (
    await request.get("/api/public/content?locale=en")
  ).json();
  expect(data.length).toBeGreaterThan(0);
  expect(JSON.stringify(data)).not.toMatch(
    /ownerId|consentId|paidPaise|@sampark|Private demonstration notes/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
});
test("anonymous private endpoints fail closed", async ({ request, page }) => {
  for (const path of [
    "claims",
    "visits",
    "audit",
    "users",
    "export",
    "attachments/unknown",
    "officers/unknown/post",
  ])
    expect((await request.get(`/api/private/${path}`)).status()).toBe(401);
  await page.goto("/en/dashboard");
  await expect(page).toHaveURL(/login/);
});
test("real sign in, persistent visit, logout and cookie isolation", async ({
  page,
  request,
}) => {
  await page.goto("/en/login");
  await page.getByLabel("Email address").fill("ano@sampark.test");
  await page.getByLabel("Password", { exact: true }).fill("Sampark-Demo-2026!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.getByRole("link", { name: "Visits", exact: true }).click();
  await page.getByRole("link", { name: "Record a visit" }).click();
  const purpose = `Browser test visit ${Date.now()}`;
  const form = page.getByRole("dialog", { name: "Record a visit" });
  await form.getByLabel("Purpose of the visit").fill(purpose);
  await form.getByLabel("Name", { exact: true }).fill("Test Officer");
  await form.getByLabel("Rank", { exact: true }).fill("Lt");
  await form.getByLabel("Cadets present").fill("20");
  await form.getByLabel("Notes").fill("Private browser-test notes");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  const detail = page.getByRole("dialog").filter({ hasText: purpose });
  await expect(detail).toBeVisible();
  await page.reload();
  await expect(page.getByRole("dialog").filter({ hasText: purpose })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit draft" })).toBeVisible();
  expect((await request.get("/api/private/visits")).status()).toBe(401);
  // Let the sheet's entrance animation finish before checking contrast.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .filter((a) => (a as CSSAnimation).animationName === "drawer-in")
      .every((a) => a.playState === "finished"),
  );
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/en/dashboard/institutions?view=map");
  await expect(
    page.getByRole("link", { name: /^Demo Central College, Lucknow/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Add institution" })).toHaveCount(0);
  await page.goto("/hi/dashboard/visits");
  await expect(page.getByRole("heading", { name: "दौरे", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "दौरा दर्ज करें" })).toBeVisible();
  await page.goto("/en/dashboard");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/login/);
  await page.goto("/en/dashboard");
  await expect(page).toHaveURL(/login/);
});
test("API login scopes results and rejects forged origins", async ({
  request,
}) => {
  const signed = await request.post("/api/auth/sign-in/email", {
    // Own client address: sign-in is rate-limited per address and the
    // previous test signs in from this machine moments earlier.
    headers: { Origin: "http://localhost:3000", "x-forwarded-for": "198.18.0.4" },
    data: { email: "co2@sampark.test", password: "Sampark-Demo-2026!" },
  });
  expect(signed.ok()).toBe(true);
  const me = await (await request.get("/api/private/me")).json();
  // Unit 2's CO sees every institution of unit 2 and nothing from unit 1.
  expect(
    me.institutions.map((i: { id: string }) => i.id).sort(),
  ).toEqual(["institution-2", "institution-2b", "institution-2c"]);
  expect(
    (
      await request.post("/api/private/visits", {
        headers: { Origin: "https://attacker.test" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect((await request.get("/api/private/audit")).status()).toBe(403);
});
test("register, approve as CO, then sign in", async ({ browser }) => {
  const email = `e2e-${Date.now()}@example.test`;
  const password = "E2E-Registration-2026";
  // The registration form is rate-limited per client address; the proxy sets
  // X-Forwarded-For in production, so the test does the same per run.
  const visitor = await (
    await browser.newContext({
      extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${Date.now() % 250}` },
    })
  ).newPage();
  await visitor.goto("/en/login");
  await visitor.getByRole("link", { name: "New here? Request an account" }).click();
  await visitor.getByLabel("Full name").fill("E2E Cadet");
  await visitor.getByLabel("Email address").fill(email);
  await visitor.getByLabel("Password").fill(password);
  await visitor.getByLabel("Institution").selectOption({ label: "Demo Central College, Lucknow" });
  await visitor.getByRole("button", { name: "Send request" }).click();
  await expect(visitor.getByRole("heading", { name: "Request received" })).toBeVisible();
  // Email confirmation is off by default: the request goes straight to the
  // approving officer.
  await expect(visitor.getByRole("status")).toContainText("will review your request");
  const result = await new AxeBuilder({ page: visitor })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  // Not yet approved: sign-in fails.
  expect(
    (
      await visitor.request.post("/api/auth/sign-in/email", {
        headers: { Origin: "http://localhost:3000" },
        data: { email, password },
      })
    ).ok(),
  ).toBe(false);
  const co = await (await browser.newContext()).newPage();
  await co.goto("/en/login");
  await co.getByLabel("Email address").fill("co@sampark.test");
  await co.getByLabel("Password", { exact: true }).fill("Sampark-Demo-2026!");
  await co.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(co).toHaveURL(/dashboard/);
  await co.getByRole("link", { name: /^Registrations/ }).click();
  await co.getByRole("button", { name: "E2E Cadet" }).first().click();
  await co.getByRole("button", { name: "Activate account" }).click();
  await expect(co.getByRole("dialog")).toHaveCount(0);
  await co.close();
  await visitor.goto("/en/login");
  await visitor.getByLabel("Email address").fill(email);
  await visitor.getByLabel("Password", { exact: true }).fill(password);
  await visitor.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(visitor).toHaveURL(/dashboard/);
  await expect(visitor.getByText("E2E Cadet")).toBeVisible();
});
test("officer registers, Group Commander activates, signs in with password, optional authenticator", async ({ browser }) => {
  const email = `e2e-officer-${Date.now()}@example.test`;
  const password = "E2E-Officer-2026!";
  const visitor = await (
    await browser.newContext({
      extraHTTPHeaders: { "x-forwarded-for": `203.0.113.${Date.now() % 250}` },
    })
  ).newPage();
  // Everyone signs in on one page; officers register from the member page.
  await visitor.goto("/login");
  await expect(visitor.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await visitor.getByRole("link", { name: "New here? Request an account" }).click();
  await visitor.getByRole("link", { name: /^Officer at a unit, group or the directorate/ }).click();
  await visitor.getByLabel("Full name, with rank").fill("Maj E2E Officer");
  await visitor.getByLabel("Email address").fill(email);
  await visitor.getByLabel("Password").fill(password);
  await visitor.locator("select[name=appointmentCode]").selectOption({ label: "Administrative Officer" });
  await visitor.locator("select[name=formationId]").selectOption({ label: "Demo Unit 1, Demo Group 1" });
  await visitor.getByRole("button", { name: "Send request" }).click();
  await expect(visitor.getByRole("heading", { name: "Request received" })).toBeVisible();
  const result = await new AxeBuilder({ page: visitor })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await expect(visitor.getByRole("status")).toContainText("will review your request");
  // Sign-in is rate-limited per client address (Better Auth); the previous
  // test signs in several times from this machine, so this officer's browser
  // gets its own address, as separate people would have.
  const gc = await (
    await browser.newContext({
      extraHTTPHeaders: { "x-forwarded-for": `192.0.2.${Date.now() % 250}` },
    })
  ).newPage();
  await gc.goto("/en/login");
  await gc.getByLabel("Email address").fill("group@sampark.test");
  await gc.getByLabel("Password", { exact: true }).fill("Sampark-Demo-2026!");
  await gc.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(gc).toHaveURL(/dashboard/);
  await gc.goto("/en/dashboard/registrations?type=officer");
  await gc.getByRole("button", { name: "Maj E2E Officer" }).first().click();
  await gc.getByRole("button", { name: "Activate account" }).click();
  await expect(gc.getByRole("dialog")).toHaveCount(0);
  await gc.close();
  await visitor.goto("/en/officers/login");
  await expect(visitor).toHaveURL(/\/en\/login$/);
  await visitor.getByLabel("Email address").fill(email);
  await visitor.getByLabel("Password", { exact: true }).fill(password);
  await visitor.getByRole("button", { name: "Sign in", exact: true }).click();
  // Password only: straight into the dashboard.
  await expect(visitor).toHaveURL(/\/en\/dashboard/);
  await expect(visitor.getByRole("heading", { name: "Overview" })).toBeVisible();
  // Optional: set up an authenticator as an app would (read key, compute code).
  await visitor.getByRole("link", { name: "Account security" }).click();
  await visitor.getByLabel("Current password").fill(password);
  await visitor.getByRole("button", { name: "Continue" }).click();
  await expect(visitor.getByRole("img", { name: /Scan this code/ })).toBeVisible();
  const key = (await visitor.locator("code").innerText()).replace(/\s/g, "");
  await visitor.getByLabel("Six-digit code from the app").fill(totp(key));
  await visitor.getByRole("button", { name: "Confirm code" }).click();
  await expect(visitor.getByRole("heading", { name: "Save your backup codes" })).toBeVisible();
  const setup = await new AxeBuilder({ page: visitor })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(setup.violations).toEqual([]);
  await visitor.getByRole("link", { name: "Continue to the dashboard" }).click();
  await expect(visitor.getByRole("heading", { name: "Overview" })).toBeVisible();
});
// RFC 6238 time-based code from a base32 key (what an authenticator app does).
function totp(base32: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of base32.toUpperCase().replace(/=+$/, "")) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
