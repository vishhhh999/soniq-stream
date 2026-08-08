import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { authConfig } from "./auth.config";
import { db } from "./lib/db";
import { users } from "./lib/db/schema";
import { eq } from "drizzle-orm";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
        if (!user) return null;
        if (!user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email };
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;

      const allowed = (process.env.ALLOWED_EMAILS || "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      if (allowed.length === 0) {
        console.warn("Google sign-in blocked: ALLOWED_EMAILS is not set.");
        return false;
      }
      const email = (profile?.email || "").toLowerCase();
      if (!allowed.includes(email)) return false;

      const [existing] = await db.select().from(users).where(eq(users.email, email));
      if (existing && existing.passwordHash) {
        console.warn(`Google sign-in blocked for ${email}: a password account already exists for this email.`);
        return false;
      }
      if (!existing) {
        await db.insert(users).values({
          id: nanoid(),
          email,
          passwordHash: null,
          createdAt: new Date(),
        });
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "google") {
          const [dbUser] = await db.select().from(users).where(eq(users.email, (user.email || "").toLowerCase()));
          if (dbUser) token.id = dbUser.id;
        } else {
          token.id = (user as any).id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as any).id = token.id as string;
      return session;
    },
  },
});
