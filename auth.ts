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

      // Google sign-ins never went through /api/setup, so without this
      // there's no `users` row for them at all — and every piece of data
      // in this app (tracks, albums) needs a stable owner id to scope by.
      // Create one on first Google sign-in if it doesn't already exist;
      // if a credentials account with this email already exists, reuse it
      // rather than creating a duplicate.
      const [existing] = await db.select().from(users).where(eq(users.email, email));
      if (!existing) {
        await db.insert(users).values({
          id: nanoid(),
          email,
          // Google users never authenticate via this hash — it exists only
          // because the column is NOT NULL. A random value, never usable.
          passwordHash: await bcrypt.hash(nanoid(32), 10),
          createdAt: new Date(),
        });
      }
      return true;
    },
    // Puts a stable internal user id on the JWT (and from there, the
    // session) for BOTH providers — Credentials already returns the real
    // db id from authorize(), Google's own `user.id` is a provider-specific
    // id that doesn't match our `users` table, so it's looked up by email
    // instead, using the row the signIn callback above guarantees exists.
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
