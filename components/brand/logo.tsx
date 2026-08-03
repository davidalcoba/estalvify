// Estalvify brand mark and lockup.
//
// The glyph is an "E" built from three ascending bars on a spine, so it reads as
// the initial and as a rising bar chart — a balance growing. Geometry lives on a
// 24×24 grid (lucide's) inside an 18×18 box: bars 3.5 thick, 3.75 gaps, pill
// ends. `scripts/generate-icons.mjs` draws the identical four rects to produce
// the favicon, PWA and Apple icons — change the geometry here and re-run it.

import { cn } from "@/lib/utils";

/**
 * The bare glyph. Inherits its colour from `currentColor` and is sized like a
 * lucide icon, so it composes anywhere an icon would.
 */
export function LogoGlyph({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn("size-6", className)}
      {...props}
    >
      <rect x="3" y="3" width="3.5" height="18" rx="1.75" />
      <rect x="3" y="3" width="18" height="3.5" rx="1.75" />
      <rect x="3" y="10.25" width="14" height="3.5" rx="1.75" />
      <rect x="3" y="17.5" width="10" height="3.5" rx="1.75" />
    </svg>
  );
}

/**
 * The app tile: the glyph on a brand-coloured rounded square. The glyph is sized
 * as a percentage of the tile so overriding the tile size scales both together.
 */
export function LogoMark({
  className,
  glyphClassName,
}: {
  className?: string;
  glyphClassName?: string;
}) {
  return (
    <div
      className={cn(
        "flex aspect-square size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground",
        className,
      )}
    >
      <LogoGlyph className={cn("size-[72%]", glyphClassName)} />
    </div>
  );
}

/**
 * The full lockup: mark plus wordmark, with an optional second line. Used where
 * the brand needs to be named rather than just marked.
 */
export function Logo({
  className,
  subtitle,
  markClassName,
}: {
  className?: string;
  subtitle?: string;
  markClassName?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LogoMark className={markClassName} />
      <div className="flex flex-col gap-0.5 leading-none text-left">
        <span className="font-semibold tracking-tight">Estalvify</span>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
    </div>
  );
}
