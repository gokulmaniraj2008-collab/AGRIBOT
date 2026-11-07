import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AGRIBOT — Coming Soon",
  description: "The future of smart agriculture is growing. AGRIBOT is coming soon.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
