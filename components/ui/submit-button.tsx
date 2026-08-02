"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/**
 * Submit button that spins while its own <form>'s action runs.
 *
 * For plain server-action forms, where there is no client handler to hang a
 * `useAction` runner off. Must be rendered inside the form it submits.
 */
export function SubmitButton({ children, ...props }: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" {...props} loading={pending}>
      {children}
    </Button>
  );
}
