import { cn } from "@/lib/utils";

interface CategoryChipProps {
  name: string;
  color?: string | null;
  className?: string;
}

export function CategoryChip({ name, color, className }: CategoryChipProps) {
  const chipStyle = color
    ? {
        color,
        borderColor: `${color}4d`,
        backgroundColor: `${color}1a`,
      }
    : undefined;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap",
        className
      )}
      style={chipStyle}
    >
      {name}
    </span>
  );
}
