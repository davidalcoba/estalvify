// Root layout — wraps the entire app
// Individual route groups have their own layouts (auth vs app shell)

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegistration } from "@/components/layout/service-worker-registration";
import { ThemeProvider } from "@/components/layout/theme-provider";
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
  // Two entries so the browser/OS chrome follows the app's own theme. A single
  // light theme color leaves a bright bar above a dark UI, which is very
  // visible once the app is installed and running full-screen. #020817 is
  // `--background` in dark (app/globals.css).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#020817" },
  ],
  width: "device-width",
  initialScale: 1,
  // Lets the page paint under the notch and home indicator, which is what
  // makes env(safe-area-inset-*) report real values. See the safe-area
  // utilities in app/globals.css.
  viewportFit: "cover",
  // No maximumScale: pinning it disables pinch-zoom, which is an accessibility
  // regression and buys nothing in standalone mode.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ServiceWorkerRegistration />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
