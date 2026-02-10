import "@/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import { TRPCReactProvider } from "@/trpc/react";
import { SessionProvider } from "next-auth/react";

export const metadata: Metadata = {
  title: {
    default: "Bussines Trip & Claim System",
    template: "%s - Bussines Trip & Claim System",
  },
  description: "Streamline your bussines trip requests and expense claims with automated approvals and integrated Microsoft authentication.",
  keywords: ["travel management", "expense claims", "approval system", "business travel"],
  authors: [{ name: "Travel & Claim System" }],
  icons: [{ rel: "icon", url: "/favicon.ico" }],
  manifest: "/manifest.json",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
  },
  themeColor: "#2563EB",
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body>
        <TRPCReactProvider>
              <SessionProvider>
          {children}
      </SessionProvider>
          </TRPCReactProvider>
      </body>
    </html>
  );
}
