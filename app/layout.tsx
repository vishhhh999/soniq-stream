import type { Metadata } from "next";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import AuthSessionProvider from "@/components/AuthSessionProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PlayerProvider } from "@/components/PlayerProvider";
import { AmbientProvider } from "@/components/AmbientProvider";
import AmbientBackground from "@/components/AmbientBackground";
import PlayerBar from "@/components/PlayerBar";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });

export const metadata: Metadata = {
  title: "SONIQ — your tracks, organized",
  description: "Personal library for work-in-progress music.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${dmSans.variable} ${spaceGrotesk.variable} font-sans antialiased`}>
        <AuthSessionProvider>
          <ThemeProvider>
            <AmbientProvider>
              <PlayerProvider>
                <AmbientBackground />
                <div className="relative z-10 min-h-screen pb-24">{children}</div>
                <PlayerBar />
              </PlayerProvider>
            </AmbientProvider>
          </ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
