// Auth layout: centered card, no sidebar
// Used for /login page

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {children}
    </div>
  );
}
