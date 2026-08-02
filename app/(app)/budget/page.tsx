import { redirect } from "next/navigation";

// Budget has been replaced by the richer "Plan" (manual cash-flow planning).
// Keep this route as a redirect so existing links/bookmarks still work.
export default function BudgetPage() {
  redirect("/plan");
}
