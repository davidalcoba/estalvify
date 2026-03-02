import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TransactionPaginationProps {
  page: number;
  totalPages: number;
  pageQuery: string;
  basePath?: string;
  size?: "sm" | "md";
}

function pageHref(basePath: string, pageQuery: string, nextPage: number): string {
  const prefix = pageQuery ? `${pageQuery}&` : "";
  return `${basePath}?${prefix}page=${nextPage}`;
}

export function TransactionPagination({
  page,
  totalPages,
  pageQuery,
  basePath = "/transactions",
  size = "md",
}: TransactionPaginationProps) {
  const btnClass = size === "sm" ? "h-7 w-7 p-0" : "h-8 w-8 p-0";
  const textClass = size === "sm" ? "text-xs px-1.5" : "text-sm px-2";

  return (
    <div className="flex items-center gap-1">
      {page > 1 ? (
        <Button variant="outline" size="sm" asChild className={btnClass}>
          <Link href={pageHref(basePath, pageQuery, page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" className={btnClass} disabled>
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}

      <span className={`${textClass} tabular-nums text-muted-foreground`}>
        {page} / {totalPages}
      </span>

      {page < totalPages ? (
        <Button variant="outline" size="sm" asChild className={btnClass}>
          <Link href={pageHref(basePath, pageQuery, page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" className={btnClass} disabled>
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
