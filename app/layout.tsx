import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

// The font variable sits on <html>: the App shell tokens live on :root and read it from there.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Goals | Bookchaowalit",
  description: "Break a goal into steps and tick them off. Saved in this browser only.",
  metadataBase: new URL("https://goal-tracker.bookchaowalit.com"),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={geistSans.variable}>
      <body>
        <Analytics />
        <SpeedInsights />
        {children}
      </body>
    </html>
  );
}
