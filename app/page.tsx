import { auth } from "@/auth";
import LibraryHome from "@/components/LibraryHome";
import LandingPage from "@/components/LandingPage";

// "/" serves two completely different things depending on auth state:
// signed-in visitors get the actual app (the library, unchanged from
// before this file existed — that logic now lives in LibraryHome.tsx),
// signed-out visitors get the public marketing landing page instead of
// being redirected straight to /login. auth.config.ts's public-paths list
// had to allow "/" through middleware for this to be reachable at all when
// logged out — this component is what decides which half to render.
export default async function Page() {
  const session = await auth();
  if (!session?.user) return <LandingPage />;
  return <LibraryHome />;
}
