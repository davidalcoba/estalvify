// Login page — Google OAuth
// Redirects to /dashboard after successful sign-in

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Sign In",
};

export default async function LoginPage() {
  const session = await auth();

  // Already authenticated → go to dashboard
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="text-center space-y-2 pb-6">
        {/* App logo */}
        <div className="flex justify-center mb-2">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-xl">E</span>
          </div>
        </div>
        <CardTitle className="text-2xl font-bold">Welcome to Estalvify</CardTitle>
        <CardDescription className="text-base">
          Your personal finance companion. Sign in to get started.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Google sign-in */}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <Button type="submit" variant="outline" className="w-full h-11 gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground pt-2">
          By signing in, you agree to our terms of service and privacy policy.
        </p>
      </CardContent>
    </Card>
  );
}
