/**
 * A stable identity for the device behind a user agent string.
 *
 * Used to recognise that a new push subscription supersedes one the same phone
 * abandoned — an iOS web app reinstall drops its subscription without calling
 * `unsubscribe()`, and the push service keeps accepting sends to the corpse, so
 * matching them up is the only way the row ever goes away.
 *
 * Comparing the user agents verbatim looked like the careful choice and is not:
 * one iPhone produced two rows six days apart carrying `Version/26.5.2` and
 * `Version/26.6`. A browser update between two subscriptions is the normal case,
 * not the edge case — anything that moves with a release has to come out.
 *
 * So this keeps the platform token and drops every number in it. Coarse on
 * purpose: two iPhones on one account share a key and the older row loses, which
 * is the same blind spot the caller already carries, and the phone that loses
 * its row gets it back the next time its owner enables push. An iPhone, an iPad
 * and a laptop stay comfortably apart, which is what the pruning actually needs.
 */
export function deviceKey(userAgent: string): string {
  // The parenthesised token is the platform: "iPhone; CPU iPhone OS 18_7 like
  // Mac OS X". Everything outside it is engine and browser versioning.
  const platform = userAgent.match(/\(([^)]*)\)/)?.[1] ?? userAgent;

  return platform
    .toLowerCase()
    .replace(/[\d._]+/g, " ")
    .replace(/[^a-z]+/g, " ")
    .trim();
}
