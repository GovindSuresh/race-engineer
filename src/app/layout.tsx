import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono, Barlow_Condensed } from "next/font/google";
import "./globals.css";

// Three fonts, three strict roles — see the note in globals.css's @theme block.
// Matching the prototype exactly: Barlow Condensed / IBM Plex Mono / Inter.

/** Prose only — subtitles and explanatory notes. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

/** Every number. A true monospace so digits column-align down a table, which
 *  matters constantly here: lap times, deltas, fuel, positions. */
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

/** Condensed, uppercase-friendly display font for headings/labels/table
 *  headers — the "timing screen" look, distinct from the body/data fonts so
 *  headers read as structure, not just bigger body text. */
const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Chaps Motorsport Race Engineer",
  description: "Sim-racing pre-race strategy and post-race performance analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${plexMono.variable} ${barlowCondensed.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
