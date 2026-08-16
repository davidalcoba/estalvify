// Auth layout: centered content, no sidebar
// Used for /login, /welcome, /invite and the MCP consent screen.
//
// It centers whatever the page renders rather than assuming a card, so /login
// can be a two-column front door while the rest stay a single narrow card. The
// padding lives here: without it a `w-full` card touches the edges of a phone
// screen.

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand/5 via-background to-brand/10 px-4 py-10 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}
