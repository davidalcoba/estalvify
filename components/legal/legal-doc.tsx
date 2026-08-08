// Renders a LegalDoc. One component for /privacy and /terms in all three
// languages, so the layout of these pages cannot drift between locales — only
// their text does.

import Link from "next/link";
import { RichText } from "@/components/i18n/rich-text";
import type { LegalBlock, LegalDoc } from "@/lib/legal/types";

function Block({ block }: { block: LegalBlock }) {
  // `term` is the lead-in ("Account data — …"). Keeping it a field rather than
  // inline markup means the em dash and the emphasis are the layout's job, not
  // something every translator has to reproduce by hand.
  return (
    <>
      {block.term && (
        <>
          <strong>{block.term}</strong> —{" "}
        </>
      )}
      {block.text}
    </>
  );
}

export function LegalDocument({ doc }: { doc: LegalDoc }) {
  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{doc.title}</h1>
        <p className="text-sm text-muted-foreground">{doc.updated}</p>
        <p className="rounded-lg border bg-muted p-3 text-sm">{doc.draftNotice}</p>
      </header>

      <div className="space-y-8 text-sm leading-6 text-muted-foreground [&_strong]:text-foreground">
        {doc.sections.map((section) => (
          <section key={section.title} className="space-y-2">
            <h2 className="text-lg font-semibold tracking-tight">{section.title}</h2>

            {section.paragraphs?.map((p, i) => (
              <p key={i}>
                <Block block={p} />
              </p>
            ))}

            {section.listIntro && <p>{section.listIntro}</p>}

            {section.list && (
              <ul className="list-disc space-y-1 pl-5">
                {section.list.map((item, i) => (
                  <li key={i}>
                    <Block block={item} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {doc.footer && (
        <footer className="border-t pt-6 text-sm text-muted-foreground">
          <RichText
            template={doc.footer.text}
            slots={{
              link: (
                <Link href={doc.footer.href} className="underline">
                  {doc.footer.linkLabel}
                </Link>
              ),
            }}
          />
        </footer>
      )}
    </article>
  );
}
