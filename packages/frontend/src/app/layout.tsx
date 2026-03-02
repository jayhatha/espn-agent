import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Navigation } from "./navigation";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: "ESPN Fantasy Baseball Assistant",
  description:
    "Draft assistance, trade advice, waiver wire suggestions, and RoS standings projections",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
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
