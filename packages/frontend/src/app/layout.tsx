import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Navigation } from "./navigation";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Fantasy CMD — ESPN Baseball",
  description:
    "FanGraphs-powered projected standings, waiver wire scoring, and trade analysis for ESPN fantasy baseball.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans">
        <a href="#main-content" className="skip-to-content">
          Skip to content
        </a>
        <Providers>
          <Navigation />
          <main id="main-content">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
