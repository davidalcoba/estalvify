// Terms of service.
//
// NOTE FOR THE OPERATOR: working draft — review with counsel and fill in the
// operator identity before opening the app to third parties.

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of Service" };

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

export default function TermsPage() {
  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Last updated: 5 August 2026</p>
        <p className="rounded-lg border bg-muted p-3 text-sm">
          Draft pending legal review: the operator identity below must be
          completed before this deployment accepts users other than its
          operator.
        </p>
      </header>

      <div className="space-y-8 text-sm leading-6 text-muted-foreground [&_strong]:text-foreground">
        <Section title="The service">
          <p>
            Estalvify is a personal finance tool operated by{" "}
            <strong>[operator — name and address]</strong>. It lets you connect
            your bank accounts through Enable Banking (a licensed PSD2
            provider), see and categorize your transactions, and plan your cash
            flow. By creating an account you accept these terms and the{" "}
            <Link href="/privacy" className="underline">Privacy Policy</Link>.
          </p>
        </Section>

        <Section title="Your account">
          <p>
            You sign in with a Google account and are responsible for keeping
            it secure. You may only connect bank accounts you are authorised to
            access. You can delete your account at any time from Settings —
            deletion is immediate and irreversible.
          </p>
        </Section>

        <Section title="Bank connections">
          <p>
            Bank access happens under PSD2 with your explicit consent, given to
            your bank via Enable Banking. Consents expire after at most 90 days
            and can be withdrawn at any time — at your bank, or by
            disconnecting the bank or deleting your account here. We never see
            or store your bank credentials, and the connection is read-only: no
            payments can be initiated through Estalvify.
          </p>
        </Section>

        <Section title="What Estalvify is not">
          <p>
            Estalvify provides information and planning tools, not financial
            advice. Figures are derived from what your bank reports and can be
            incomplete or delayed; verify anything important against your bank.
            AI-generated insights are suggestions, not recommendations from a
            qualified advisor.
          </p>
        </Section>

        <Section title="Acceptable use">
          <p>
            Don&apos;t attempt to access other users&apos; data, probe or
            overload the service, or use it for anything unlawful. We may
            suspend accounts that do.
          </p>
        </Section>

        <Section title="Liability">
          <p>
            The service is provided &quot;as is&quot;. To the extent permitted
            by law, the operator is not liable for indirect damages or for
            decisions made on the basis of the information shown. Nothing in
            these terms limits liability that cannot be limited by law.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            These terms may change; material changes will be announced in the
            app before they take effect. Continuing to use the service after
            that means you accept the new terms.
          </p>
        </Section>
      </div>
    </article>
  );
}
