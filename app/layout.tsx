import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// General Sans, replaces the previous Inter Tight (body) + JetBrains Mono
// (display/headings) pairing entirely — one family, weight contrast does
// the hierarchy work instead of a font-family swap between body and
// headings. Local files (not next/font/google) since this is a licensed
// Fontshare package, not a Google Fonts family.
const generalSans = localFont({
  variable: "--font-general-sans",
  display: "swap",
  src: [
    { path: "../public/fonts/GeneralSans-Extralight.woff2", weight: "200", style: "normal" },
    { path: "../public/fonts/GeneralSans-Light.woff2", weight: "300", style: "normal" },
    { path: "../public/fonts/GeneralSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/GeneralSans-Italic.woff2", weight: "400", style: "italic" },
    { path: "../public/fonts/GeneralSans-Medium.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/GeneralSans-Semibold.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/GeneralSans-Bold.woff2", weight: "700", style: "normal" },
  ],
});
import AuthSessionProvider from "@/components/AuthSessionProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PlayerProvider } from "@/components/PlayerProvider";
import { AmbientProvider } from "@/components/AmbientProvider";
import AuthedPlayerShell from "@/components/AuthedPlayerShell";
import GoogleLinkToast from "@/components/GoogleLinkToast";
import PlayTracker from "@/components/PlayTracker";
import InstallPrompt from "@/components/InstallPrompt";
import CookieConsent from "@/components/CookieConsent";

export const metadata: Metadata = {
  title: "SONIQ",
  applicationName: "SONIQ",
  description: "SONIQ is a personal library for organizing, sharing, and listening to work-in-progress music — upload demos, keep every version, and control exactly who can access what.",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/logo.svg", type: "image/svg+xml" }],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SONIQ",
  },
  // No openGraph metadata existed at all before this — Google's OAuth
  // branding verification cross-checks the app name against machine-
  // readable signals on the homepage, not just visible body text. og:title
  // and og:site_name are the clearest, most standard signal for "what is
  // this app called" that an automated checker would look for.
  openGraph: {
    title: "SONIQ",
    siteName: "SONIQ",
    description: "SONIQ is a personal library for organizing, sharing, and listening to work-in-progress music.",
    url: "https://www.soniq.lol",
    type: "website",
  },
};

export const viewport = {
  themeColor: "#121212",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before hydration, before ThemeProvider's own effects can —
            without this, ThemeProvider defaults its state to "dark" and
            only reads the real stored/system preference in a useEffect,
            so a light-theme user saw a flash of dark theme on every load
            before it self-corrected a render later. This just applies the
            class synchronously, before paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var stored = localStorage.getItem("soniq-theme");
                var theme = stored || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
                if (theme === "dark") document.documentElement.classList.add("dark");
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className={`${generalSans.variable} font-sans antialiased`}>
        <AuthSessionProvider>
          <ThemeProvider>
            <AmbientProvider>
              <PlayerProvider>
                <AuthedPlayerShell />
                <GoogleLinkToast />
                <PlayTracker />
                <InstallPrompt />
                <CookieConsent />
                <div className="relative z-10 min-h-[calc(100vh-6rem)] pb-24">{children}</div>
              </PlayerProvider>
            </AmbientProvider>
          </ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
