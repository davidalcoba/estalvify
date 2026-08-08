import { Fragment } from "react";

/**
 * Renders a message whose placeholders are React nodes — a link, an icon, a
 * bold span — instead of plain values.
 *
 * The alternative is splicing a sentence out of JSX fragments ("By signing in,
 * you agree to our " + <Link/> + " and " + <Link/>), which cannot be
 * translated: word order moves, and in some languages the link text has to
 * carry an article the English fragment did not. Keeping the whole sentence in
 * the dictionary with `{terms}` / `{privacy}` markers leaves that freedom with
 * the translator.
 *
 * Not a client component: no hooks, no state, so it renders in either tree.
 *
 *   <RichText
 *     template={t("auth.login.legal")}
 *     slots={{ terms: <Link href="/terms">…</Link> }}
 *   />
 */
export function RichText({
  template,
  slots,
}: {
  template: string;
  slots: Record<string, React.ReactNode>;
}) {
  // The capturing group keeps the delimiters, so the split alternates
  // literal text and placeholders.
  const parts = template.split(/(\{\w+\})/g);

  return (
    <>
      {parts.map((part, i) => {
        const name = /^\{(\w+)\}$/.exec(part)?.[1];
        return (
          <Fragment key={i}>
            {name && name in slots ? slots[name] : part}
          </Fragment>
        );
      })}
    </>
  );
}
