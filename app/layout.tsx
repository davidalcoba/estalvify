// Root layout — wraps the entire app
// Individual route groups have their own layouts (auth vs app shell)

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegistration } from "@/components/layout/service-worker-registration";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    template: "%s | Estalvify",
    default: "Estalvify — Personal Finance",
  },
  description:
    "Take control of your money. Track, categorize, and budget your expenses across all your bank accounts.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Estalvify",
  },
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
