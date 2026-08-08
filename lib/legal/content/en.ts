// Legal pages — English (the source text).
//
// NOTE FOR THE OPERATOR: both documents are working drafts written to match
// what the code actually does. Review them (ideally with counsel) and fill in
// the controller/operator identity and contact address before opening the app
// to third parties. Keep them in sync with the code: if data handling changes,
// these change in the same PR — in ALL THREE languages.

import type { LegalContent } from "../types";

export const en: LegalContent = {
  privacy: {
    title: "Privacy Policy",
    updated: "Last updated: 5 August 2026",
    draftNotice:
      "Draft pending legal review: the data controller identity and contact address below must be completed before this deployment accepts users other than its operator.",
    sections: [
      {
        title: "Who is responsible for your data",
        paragraphs: [
          {
            text: "Estalvify is operated by [data controller — name and address]. For any privacy request, contact [contact e-mail].",
          },
        ],
      },
      {
        title: "What we collect and why",
        paragraphs: [
          {
            term: "Account data",
            text: "your name, e-mail address and profile picture, received from Google when you sign in. Legal basis: performance of contract (operating your account).",
          },
          {
            term: "Banking data",
            text: "when you connect a bank, we receive your account list, daily balances and transactions (amounts, dates, descriptions, payment references) through Enable Banking, a licensed PSD2 provider, under the explicit consent you give your bank. We deliberately minimise what we store: full IBANs are never stored — only the last four digits.",
          },
          {
            term: "Data you create",
            text: "categories, categorization rules, budgets, planned items, recurring series and preferences.",
          },
          {
            text: "We do not sell your data, use it for advertising, or profile you beyond the features you see in the app.",
          },
        ],
      },
      {
        title: "Who processes it for us",
        listIntro:
          "Your data is handled by these processors, under data-processing agreements:",
        list: [
          { term: "Vercel", text: "application hosting and logs." },
          {
            term: "Neon",
            text: "database, hosted in the EU (AWS eu-central-1, Frankfurt).",
          },
          {
            term: "Enable Banking",
            text: "PSD2 bank connectivity (the licensed third-party provider your bank consent is given to).",
          },
          { term: "Google", text: "sign-in only." },
          {
            term: "Anthropic",
            text: "optional AI insights. Only anonymized aggregates and category names are sent; never account numbers, transaction descriptions or merchant names.",
          },
        ],
      },
      {
        title: "How long we keep it",
        paragraphs: [
          {
            text: "Your data is kept while your account exists. Expired login sessions, expired authorization codes and tokens, and notifications older than 90 days (read) or one year (unread) are purged automatically. When you delete your account, all your data is removed immediately; residual copies in infrastructure logs and database backups age out on the providers’ schedules (weeks, not years).",
          },
        ],
      },
      {
        title: "Your rights",
        paragraphs: [
          {
            text: "Under the GDPR you can access, correct, export, restrict, object to and erase your data. Two of these are self-service in Settings → Privacy & data:",
          },
        ],
        list: [
          {
            term: "Export",
            text: "download everything as a JSON file (portability).",
          },
          {
            term: "Delete account",
            text: "erases all your data and revokes your bank consents at Enable Banking.",
          },
        ],
      },
      {
        title: "Where to complain",
        paragraphs: [
          {
            text: "For anything else, contact the controller above. You can also lodge a complaint with your supervisory authority (in Spain, the AEPD).",
          },
        ],
      },
      {
        title: "Security",
        paragraphs: [
          {
            text: "All traffic is encrypted in transit (TLS) and data is encrypted at rest by our database provider. Bank connectivity uses signed requests to Enable Banking; we never see or store your bank credentials. Access to the application requires Google sign-in, and API access uses short-lived, revocable tokens that you explicitly approve on a consent screen.",
          },
        ],
      },
    ],
    footer: {
      text: "See also the {link}.",
      linkLabel: "Terms of Service",
      href: "/terms",
    },
  },

  terms: {
    title: "Terms of Service",
    updated: "Last updated: 5 August 2026",
    draftNotice:
      "Draft pending legal review: the operator identity below must be completed before this deployment accepts users other than its operator.",
    sections: [
      {
        title: "The service",
        paragraphs: [
          {
            text: "Estalvify is a personal finance tool operated by [operator — name and address]. It lets you connect your bank accounts through Enable Banking (a licensed PSD2 provider), see and categorize your transactions, and plan your cash flow. By creating an account you accept these terms and the Privacy Policy.",
          },
        ],
      },
      {
        title: "Your account",
        paragraphs: [
          {
            text: "You sign in with a Google account and are responsible for keeping it secure. You may only connect bank accounts you are authorised to access. You can delete your account at any time from Settings — deletion is immediate and irreversible.",
          },
        ],
      },
      {
        title: "Bank connections",
        paragraphs: [
          {
            text: "Bank access happens under PSD2 with your explicit consent, given to your bank via Enable Banking. Consents expire after at most 90 days and can be withdrawn at any time — at your bank, or by disconnecting the bank or deleting your account here. We never see or store your bank credentials, and the connection is read-only: no payments can be initiated through Estalvify.",
          },
        ],
      },
      {
        title: "What Estalvify is not",
        paragraphs: [
          {
            text: "Estalvify provides information and planning tools, not financial advice. Figures are derived from what your bank reports and can be incomplete or delayed; verify anything important against your bank. AI-generated insights are suggestions, not recommendations from a qualified advisor.",
          },
        ],
      },
      {
        title: "Acceptable use",
        paragraphs: [
          {
            text: "Don’t attempt to access other users’ data, probe or overload the service, or use it for anything unlawful. We may suspend accounts that do.",
          },
        ],
      },
      {
        title: "Liability",
        paragraphs: [
          {
            text: "The service is provided “as is”. To the extent permitted by law, the operator is not liable for indirect damages or for decisions made on the basis of the information shown. Nothing in these terms limits liability that cannot be limited by law.",
          },
        ],
      },
      {
        title: "Changes",
        paragraphs: [
          {
            text: "These terms may change; material changes will be announced in the app before they take effect. Continuing to use the service after that means you accept the new terms.",
          },
        ],
      },
    ],
    footer: {
      text: "See also the {link}.",
      linkLabel: "Privacy Policy",
      href: "/privacy",
    },
  },
};
