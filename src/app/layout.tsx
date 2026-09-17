import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AFC Command Center",
  description:
    "Content calendar, production pipeline, and sponsor delivery tracking, on top of Notion.",
};

export const viewport: Viewport = {
  themeColor: "#0d0d0d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-plane text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
