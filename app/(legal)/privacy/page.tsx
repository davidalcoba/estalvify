// Privacy policy (GDPR arts. 13–14 transparency).
//
// NOTE FOR THE OPERATOR: this is a working draft written to match what the
// code actually does — review it (ideally with counsel) and fill in the
// controller identity and contact address before opening the app to third
// parties. Keep it in sync with the code: if data handling changes, this page
// changes in the same PR.

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy Policy" };

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: 5 August 2026</p>
        <p className="rounded-lg border bg-muted p-3 text-sm">
          Draft pending legal review: the data controller identity and contact
          address below must be completed before this deployment accepts users
          other than its operator.
        </p>
      </header>

      <div className="space-y-8 text-sm leading-6 text-muted-foreground [&_strong]:text-foreground">
        <Section title="Who is responsible for your data">
          <p>
            Estalvify is operated by <strong>[data controller — name and
            address]</strong>. For any privacy request, contact{" "}
            <strong>[contact e-mail]</strong>.
          </p>
        </Section>

        <Section title="What we collect and why">
          <p>
            <strong>Account data</strong> — your name, e-mail address and
            profile picture, received from Google when you sign in. Legal
            basis: performance of contract (operating your account).
          </p>
          <p>
            <strong>Banking data</strong> — when you connect a bank, we receive
            your account list, daily balances and transactions (amounts, dates,
            descriptions, payment references) through Enable Banking, a
            licensed PSD2 provider, under the explicit consent you give your
            bank. We deliberately minimise what we store: full IBANs are never
            stored — only the last four digits.
          </p>
          <p>
            <strong>Data you create</strong> — categories, categorization
            rules, budgets, planned items, recurring series and preferences.
          </p>
          <p>
            We do not sell your data, use it for advertising, or profile you
            beyond the features you see in the app.
          </p>
        </Section>

        <Section title="Who processes it for us">
          <p>Your data is handled by these processors, under data-processing agreements:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Vercel</strong> — application hosting and logs.
            </li>
            <li>
              <strong>Neon</strong> — database, hosted in the EU
              (AWS eu-central-1, Frankfurt).
            </li>
            <li>
              <strong>Enable Banking</strong> — PSD2 bank connectivity (the
              licensed third-party provider your bank consent is given to).
            </li>
            <li>
              <strong>Google</strong> — sign-in only.
            </li>
            <li>
              <strong>Anthropic</strong> — optional AI insights. Only
              anonymized aggregates and category names are sent; never account
              numbers, transaction descriptions or merchant names.
            </li>
          </ul>
        </Section>

        <Section title="How long we keep it">
          <p>
            Your data is kept while your account exists. Expired login
            sessions, expired authorization codes and tokens, and notifications
            older than 90 days (read) or one year (unread) are purged
            automatically. When you delete your account, all your data is
            removed immediately; residual copies in infrastructure logs and
            database backups age out on the providers&apos; schedules (weeks,
            not years).
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Under the GDPR you can access, correct, export, restrict, object to
            and erase your data. Two of these are self-service in{" "}
            <strong>Settings → Privacy &amp; data</strong>:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Export</strong> — download everything as a JSON file
              (portability).
            </li>
            <li>
              <strong>Delete account</strong> — erases all your data and
              revokes your bank consents at Enable Banking.
            </li>
          </ul>
          <p>
            For anything else, contact the controller above. You can also lodge
            a complaint with your supervisory authority (in Spain, the AEPD).
          </p>
        </Section>

        <Section title="Security">
          <p>
            All traffic is encrypted in transit (TLS) and data is encrypted at
            rest by our database provider. Bank connectivity uses signed
            requests to Enable Banking; we never see or store your bank
            credentials. Access to the application requires Google sign-in, and
            API access uses short-lived, revocable tokens that you explicitly
            approve on a consent screen.
          </p>
        </Section>
      </div>

      <footer className="border-t pt-6 text-sm text-muted-foreground">
        See also the <Link href="/terms" className="underline">Terms of Service</Link>.
      </footer>
    </article>
  );
}
