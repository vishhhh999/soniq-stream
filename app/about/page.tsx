import LandingPage from "@/components/LandingPage";

// Unlike app/page.tsx, this route does NOT check auth() or redirect —
// it's meant to be reachable by everyone, signed in or not, so people
// already using the app have somewhere to go back to for the pitch,
// the feature list, pricing, and the legal links (Terms/Privacy/Cookies/
// Contact), none of which are visible anywhere once you're inside the
// actual library UI.
export default function AboutPage() {
  return <LandingPage />;
}
