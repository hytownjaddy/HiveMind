import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "HiveMind", template: "%s · HiveMind" },
  description:
    "Adaptive technical mastery workstation: real labs, validated practice, career readiness.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0b0e14",
  width: "device-width",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
