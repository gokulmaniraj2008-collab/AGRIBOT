import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme-context";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const siteUrl = "https://agribot.website";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "AgriBot AI Dashboard",
    template: "%s · AgriBot AI Dashboard",
  },
  description: "Live monitoring and control for the AgriBot smart farming robot. AI Powered. Monitor. Analyze. Protect. Grow better — from your phone.",
  keywords: [
    "AgriBot", "smart farming", "AI dashboard", "crop monitoring",
    "pest detection", "smart irrigation", "soil analysis", "agriculture AI",
  ],
  openGraph: {
    type: "website",
    siteName: "AgriBot AI Dashboard",
    title: "AgriBot AI Dashboard",
    description: "Live monitoring and control for the AgriBot smart farming robot.",
    url: siteUrl,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "AgriBot AI Dashboard" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AgriBot AI Dashboard",
    description: "Live monitoring and control for the AgriBot smart farming robot.",
    images: ["/og-image.png"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
