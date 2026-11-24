import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor } from "better-auth/plugins";
import { db } from "../db";
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
  },
  session: {
    expiresIn: 60 * 60 * 8,
    updateAge: 60 * 15,
    cookieCache: { enabled: false },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "authRateLimit",
    window: 60,
    max: 30,
  },
  advanced: { useSecureCookies: process.env.APP_MODE === "production" },
  plugins: [twoFactor({ issuer: "Sampark" })],
});
