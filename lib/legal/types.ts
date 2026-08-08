// Shape of the legal pages' content, so /privacy and /terms can exist in three
// languages without three copies of the page component.
//
// Why these live here rather than in the message dictionaries: a privacy
// policy is continuous prose, not interface labels. Flattened into ~60
// dictionary keys it becomes unreadable and un-reviewable — and these pages
// have to be READ end to end by whoever signs off on them. A document per
// locale keeps each version reviewable as a document, while the shared type
// still forces every locale to carry every section (a missing one is a type
// error, exactly like a missing message).

/** A paragraph or list item; `term` renders as a lead-in in bold. */
export interface LegalBlock {
  term?: string;
  text: string;
}

export interface LegalSection {
  title: string;
  paragraphs?: LegalBlock[];
  /** Sentence introducing the list below it. */
  listIntro?: string;
  list?: LegalBlock[];
}

export interface LegalDoc {
  title: string;
  /** "Last updated: 5 August 2026" — the date is part of the string so each
   *  language writes it its own way. */
  updated: string;
  /** The operator-facing warning shown at the top while these are drafts. */
  draftNotice: string;
  sections: LegalSection[];
  /**
   * Closing line with a link to the sibling document. `{link}` marks where the
   * anchor goes; `linkLabel` is its text.
   */
  footer?: { text: string; linkLabel: string; href: string };
}

export interface LegalContent {
  privacy: LegalDoc;
  terms: LegalDoc;
}
