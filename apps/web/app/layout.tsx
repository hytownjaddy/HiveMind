import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "HiveMind", template: "%s · HiveMind" },
  description: "Adaptive technical mastery, real infrastructure labs, infinite practice.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#09090b",
  width: "device-width",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-zinc-950 text-zinc-100">{children}</body>
    </html>
  );
}
