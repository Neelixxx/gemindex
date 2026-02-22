import type { Metadata } from "next";
import { Space_Grotesk, Source_Serif_4 } from "next/font/google";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gem Index | Pokemon TCG Analytics",
  description:
    "Track PSA and TAG gem rates, set values, market history, liquidity, arbitrage, and personal collection performance.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${sourceSerif.variable}`}>
        {children}
      </body>
    </html>
  );
}
