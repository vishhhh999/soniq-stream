import type { Metadata } from "next";
import { JetBrains_Mono, Inter_Tight } from "next/font/google";
import "./globals.css";
import AuthSessionProvider from "@/components/AuthSessionProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PlayerProvider } from "@/components/PlayerProvider";
import { AmbientProvider } from "@/components/AmbientProvider";
import AuthedPlayerShell from "@/components/AuthedPlayerShell";
import GoogleLinkToast from "@/components/GoogleLinkToast";
import PlayTracker from "@/components/PlayTracker";

const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-display" });

export const metadata: Metadata = {
  title: "SONIQ — your tracks, organized",
  description: "Personal library for work-in-progress music.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${interTight.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <AuthSessionProvider>
          <ThemeProvider>
            <AmbientProvider>
              <PlayerProvider>
                <AuthedPlayerShell />
                <GoogleLinkToast />
                <PlayTracker />
                <div className="relative z-10 min-h-screen pb-24">{children}</div>
              </PlayerProvider>
            </AmbientProvider>
          </ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
