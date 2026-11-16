import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Figtree, Fraunces, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const plex = IBM_Plex_Mono({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "RouteOverlay",
  description:
    "Local proof of concept for importing a Google Maps directions URL and testing whether the selected route can be reconstructed.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${figtree.variable} ${fraunces.variable} ${plex.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
