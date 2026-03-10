// Responsive modal: renders as a centered modal on desktop (md+) and as a
// bottom sheet on mobile — the same primitive pattern used by QuickRuleDialog.

"use client";

import { Dialog as Primitive } from "radix-ui";
import { cn } from "@/lib/utils";

interface ResponsiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}

export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  children,
}: ResponsiveModalProps) {
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 duration-200" />

        {/* Mobile: bottom sheet */}
        <Primitive.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            "fixed z-50 bg-background shadow-xl outline-none",
            // Mobile layout: bottom sheet
            "inset-x-0 bottom-0 rounded-t-2xl border-t",
            "max-h-[90vh] overflow-y-auto",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
            "duration-300",
            // Desktop layout: centered modal
            "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2",
            "md:-translate-x-1/2 md:-translate-y-1/2",
            "md:w-full md:max-w-md md:rounded-xl md:border md:max-h-[85vh]",
            "md:data-[state=open]:slide-in-from-bottom-0 md:data-[state=open]:zoom-in-95",
            "md:data-[state=closed]:zoom-out-95"
          )}
        >
          {/* Mobile handle bar */}
          <div className="flex justify-center pt-3 pb-1 md:hidden">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/25" />
          </div>

          <div className="px-5 pb-6 pt-2 md:px-6 md:pt-6 md:pb-6">
            <Primitive.Title className="text-lg font-semibold mb-5">{title}</Primitive.Title>
            {children}
          </div>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
