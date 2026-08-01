"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SimpleSelectOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

/**
 * Convenience wrapper over the Radix-based Select primitive for the common
 * "flat list of options" case. Keeps the 19 previously-native <select> call
 * sites consistent and theme-aware.
 *
 * Radix gotcha: a SelectItem may never have value="" (it throws). Use
 * `placeholder` for the empty state and give every real option a non-empty
 * value; callers that need an "all/none" option should use a sentinel value
 * and map it in their handler.
 */
export function SimpleSelect({
  value,
  onValueChange,
  options,
  placeholder,
  name,
  disabled,
  size = "default",
  className,
  contentClassName,
  ariaLabel,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  options: SimpleSelectOption[];
  placeholder?: string;
  name?: string;
  disabled?: boolean;
  size?: "sm" | "default";
  className?: string;
  contentClassName?: string;
  ariaLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} name={name} disabled={disabled}>
      <SelectTrigger size={size} className={className} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
