import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const head = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-head", weight: ["500", "700", "800"] });
const body = Figtree({ subsets: ["latin"], variable: "--font-body" });
const code = JetBrains_Mono({ subsets: ["latin"], variable: "--font-code", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "QuoteLah - WhatsApp enquiry inbox | Ah Seng Hardware",
  description:
    "Turn messy WhatsApp hardware enquiries into reviewed quotations. Demo inbox for Ah Seng Hardware, Kajang, using synthetic data.",
};

export const viewport: Viewport = { themeColor: "#173a40", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-MY" className={`${head.variable} ${body.variable} ${code.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
