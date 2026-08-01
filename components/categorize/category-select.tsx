"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category } from "./category-options";

// Radix-based category picker with the same parent/child hierarchy that
// CategoryOptions rendered for native <select>. Replaces every raw category
// <select> across categorize and rules.
export function CategorySelect({
  value,
  defaultValue,
  onValueChange,
  categories,
  placeholder = "Pick a category…",
  disabled,
  size = "default",
  className,
  ariaLabel,
}: {
  value?: string;
  /** Uncontrolled initial value. Use with a `key` to reset per item. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  categories: Category[];
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "default";
  className?: string;
  ariaLabel?: string;
}) {
  const parents = categories.filter((c) => !c.parentId);
  const childrenMap: Record<string, Category[]> = {};
  for (const c of categories) {
    if (c.parentId) (childrenMap[c.parentId] ??= []).push(c);
  }

  return (
    <Select
      value={value || undefined}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <SelectTrigger size={size} className={className} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {parents.map((parent) => {
          const children = childrenMap[parent.id] ?? [];
          if (children.length === 0) {
            return (
              <SelectItem key={parent.id} value={parent.id}>
                {parent.name}
              </SelectItem>
            );
          }
          return (
            <SelectGroup key={parent.id}>
              <SelectLabel>{parent.name}</SelectLabel>
              <SelectItem value={parent.id}>{parent.name}</SelectItem>
              {children.map((child) => (
                <SelectItem key={child.id} value={child.id}>
                  {child.name}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}
