import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/caveat/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "GapMap — every gap, a next step", template: "%s · GapMap" },
  description:
    "GapMap reads completed exam papers, links every gap to the lecture slide that teaches it, and checks whether the next step helped.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#B51834",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
