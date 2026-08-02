import type { RecurringItem } from "@/lib/recurring/recurring-dto";
import type { RecurringRowHandlers } from "@/components/recurring/shared/recurring-item-row";

export interface RecurringSection {
  key: string;
  title: string;
  description?: string;
  items: RecurringItem[];
}

// Shared prop shape for the desktop and mobile recurring views.
export interface RecurringListViewProps extends RecurringRowHandlers {
  sections: RecurringSection[];
  currency: string;
  locale: string;
  dateLocale: string;
}
