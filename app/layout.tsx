// Root layout — wraps the entire app
// Individual route groups have their own layouts (auth vs app shell)

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegistration } from "@/components/layout/service-worker-registration";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { I18nProvider } from "@/components/i18n/i18n-provider";
import { getT, getUiLocale, messagesFor } from "@/lib/i18n/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Dynamic because the title and description follow the member's language.
// Everything else here is static; only the two strings at the top change.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();

  return {
  title: {
    template: `%s | ${t("app.name")}`,
    default: `${t("app.name")} — ${t("app.tagline")}`,
  },
  description: t("app.description"),
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: t("app.name"),
    // iOS does not build a launch screen from the manifest the way Android
    // does: without these an installed app shows a blank white screen while
    // the first page loads. One exact-resolution image per device, portrait
    // only (the manifest pins portrait-primary). Regenerate with
    // `node scripts/generate-icons.mjs`, which prints this list.
    startupImage: [
    { url: "/splash/launch-1320x2868.png", media: "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
    { url: "/splash/launch-1206x2622.png", media: "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
    { url: "/splash/launch-1290x2796.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
    { url: "/splash/launch-1179x2556.png", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
    { url: "/splash/launch-1284x2778.png", media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
    { url: "/splash/launch-1170x2532.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
    { url: "/splash/launch-1125x2436.png", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
    { url: "/splash/launch-1242x2688.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
    { url: "/splash/launch-828x1792.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
    { url: "/splash/launch-1242x2208.png", media: "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
    { url: "/splash/launch-750x1334.png", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
    { url: "/splash/launch-2048x2732.png", media: "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
    { url: "/splash/launch-1668x2388.png", media: "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
    { url: "/splash/launch-1668x2224.png", media: "(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
    { url: "/splash/launch-1536x2048.png", media: "(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
    ],
  },
  };
}

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Mounted at the ROOT rather than per route group, so the app shell, the
  // auth screens and the legal pages all share one provider — and one copy of
  // the messages in the payload. Only the active locale's strings are sent.
  const locale = await getUiLocale();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <I18nProvider locale={locale} messages={messagesFor(locale)}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <ServiceWorkerRegistration />
            {children}
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
