import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgriBot AI — Intelligent Robotics for Smarter Agriculture",
  description:
    "AgriBot AI combines robotics, computer vision, IoT sensors and intelligent automation to help farmers monitor and manage their fields more efficiently.",
};

// LIGHT THEME ONLY. No `dark` class is ever applied to <html>, and no
// prefers-color-scheme handling exists anywhere in this app on purpose.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-bg text-text-primary font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
