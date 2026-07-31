"use client";

// Wraps next-themes so the class-based `.dark` theme (defined in globals.css)
// can be toggled at runtime. Rendered near the root so every route inherits it.

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
