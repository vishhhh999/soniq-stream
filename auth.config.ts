import type { NextAuthConfig } from "next-auth";

// Edge-safe half of the config — imported by middleware.ts, which runs on
// Vercel's Edge Runtime. No providers, no bcrypt, no DB calls here (that's
// what took down the previous password-gate version — Node's `crypto` isn't
// available on Edge). Providers live in auth.ts, which only ever runs in the
// Node runtime via the API route handler.
export const authConfig = {
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;
      const publicPaths = [
        /^\/$/,                // landing page for logged-out visitors — app/page.tsx
                                // itself checks auth and renders the real
                                // library instead once signed in, so this
                                // doesn't expose anything.
        /^\/login$/,
        /^\/setup$/,
        /^\/api\/setup$/,
        /^\/s\//,
        /^\/api\/share\//,
        /^\/invite\//,         // invite acceptance pages
        /^\/api\/invite\//,    // invite preview API (GET, no auth needed)
        /^\/terms$/,
        /^\/privacy$/,
        /^\/cookies$/,
        /^\/contact$/,
        /^\/api\/contact$/,
        /^\/api\/billing\/webhook$/, // Stripe's servers hit this, no session cookie
        /^\/api\/auth\//, // NextAuth's own routes: signin, callback, session, csrf, signout
      ];
      if (publicPaths.some((re) => re.test(pathname))) return true;
      return isLoggedIn; // false triggers automatic redirect to the signIn page
    },
  },
  providers: [], // populated in auth.ts
} satisfies NextAuthConfig;
