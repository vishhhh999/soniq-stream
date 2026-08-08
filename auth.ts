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

      const email = (profile?.email || "").toLowerCase();
      if (!email) return false;

      const [existing] = await db.select().from(users).where(eq(users.email, email));

      if (existing && existing.passwordHash) {
        // Password account exists — this is a Google link. If it's the first
        // time, stamp googleLinkedAt so the jwt callback can signal the toast.
        if (!existing.googleLinkedAt) {
          await db
            .update(users)
            .set({ googleLinkedAt: new Date() })
            .where(eq(users.id, existing.id));
          // Signal to jwt callback that this sign-in is the first link.
          // We store it on the account object — it's available in jwt on
          // the same auth cycle.
          (account as any).__justLinked = true;
        }
        return true;
      }

      if (!existing) {
        // New Google-only account.
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
          if (dbUser) {
            token.id = dbUser.id;
            // Only true on the exact sign-in where linking first happened.
            token.justLinked = (account as any).__justLinked === true;
          }
        } else {
          token.id = (user as any).id;
          token.justLinked = false;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
        // Pass through to client so it can show the one-time toast.
        (session.user as any).justLinked = token.justLinked ?? false;
      }
      return session;
    },
  },
});
