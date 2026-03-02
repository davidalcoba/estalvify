// Root page: proxy.ts handles redirect to /login for unauthenticated users.
// Authenticated users that reach here are sent to /dashboard.
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/dashboard");
}
