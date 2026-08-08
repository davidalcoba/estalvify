// English messages — the SOURCE dictionary.
//
// Keys are flat and dotted (`settings.regional.title`) rather than nested, for
// one reason: `keyof typeof en` is then the exact set of valid keys, and
// `Record<MessageKey, string>` in es.ts / ca.ts makes an untranslated string a
// TYPE ERROR instead of a runtime fallback. `npm run typecheck` is the
// completeness check; there is no separate lint for it.
//
// Conventions:
//  - Placeholders are `{name}` and are interpolated by lib/i18n/translate.ts.
//  - A count-dependent message ships as `<base>.one` + `<base>.other` and is
//    read with `t.plural(base, n)`; `{count}` is supplied automatically.
//  - Sections mirror the feature folders, so a screen's copy is one block.

export const en = {
  // ─────────────────────────── common ───────────────────────────
  "common.save": "Save",
  "common.saving": "Saving…",
  "common.saved": "Saved",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.delete": "Delete",
  "common.deleting": "Deleting…",
  "common.edit": "Edit",
  "common.remove": "Remove",
  "common.confirm": "Confirm",
  "common.back": "Back",
  "common.retry": "Try again",
  "common.loading": "Loading…",
  "common.search": "Search",
  "common.clear": "Clear",
  "common.apply": "Apply",
  "common.applying": "Applying…",
  "common.all": "All",
  "common.none": "None",
  "common.yes": "Yes",
  "common.no": "No",
  "common.today": "Today",
  "common.optional": "Optional",
  "common.previous": "Previous",
  "common.next": "Next",
  "common.error": "Something went wrong",
  "common.dismiss": "Dismiss",
  "common.readOnly": "Read-only",

  // ─────────────────────────── shell / navigation ───────────────────────────
  "app.name": "Estalvify",
  "app.tagline": "Personal Finance",
  "app.description":
    "Take control of your money. Track, categorize, and budget your expenses across all your bank accounts.",

  "nav.group.overview": "Overview",
  "nav.group.planning": "Planning",
  "nav.group.money": "Money",
  "nav.dashboard": "Dashboard",
  "nav.categorize": "Categorize",
  "nav.insights": "Insights",
  "nav.rules": "Rules",
  "nav.notifications": "Notifications",
  "nav.budget": "Budget",
  "nav.recurring": "Recurring",
  "nav.upcoming": "Upcoming",
  "nav.forecast": "Forecast",
  "nav.reports": "Reports",
  "nav.transactions": "Transactions",
  "nav.accounts": "Accounts",
  "nav.bankAccounts": "Bank Accounts",
  "nav.connectBank": "Connect Bank",
  "nav.settings": "Settings",
  "nav.signOut": "Sign out",
  "nav.closeMenu": "Close menu",
  "nav.user": "User",

  "theme.toggle": "Toggle theme",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.system": "System",

  "install.ios": "Install Estalvify: tap {share} then “Add to Home Screen”.",
  "install.share": "Share",
  "install.other": "Install Estalvify for a full-screen app.",
  "install.action": "Install",

  // ─────────────────────────── error / fallback pages ───────────────────────────
  "error.title": "Something went wrong",
  "error.body": "An unexpected error occurred. Try again, or go back to the dashboard.",
  "error.digest": "Reference: {digest}",
  "error.backToDashboard": "Back to dashboard",
  "notFound.title": "Page not found",
  "notFound.body": "That page doesn’t exist, or it moved somewhere else.",
  "offline.title": "You’re offline",
  "offline.body":
    "Estalvify needs a connection to load your accounts. This page will work again as soon as you’re back online.",
  "offline.retry": "Try again",

  // ─────────────────────────── notifications ───────────────────────────
  "notifications.title": "Notifications",
  "notifications.markAllRead": "Mark all read",
  "notifications.allCaughtUp": "You’re all caught up.",
  "notifications.unread": "Unread",
  "notifications.checkNow": "Check now",
  "notifications.checking": "Checking…",
  "notifications.empty.title": "No notifications",
  "notifications.empty.body":
    "Alerts about upcoming charges, expiring bank access and budget limits show up here.",
  "notifications.filter.all": "All",
  "notifications.filter.unread": "Unread",
  "notifications.markRead": "Mark as read",
  "notifications.time.now": "just now",
  "notifications.time.minutes": "{count}m ago",
  "notifications.time.hours": "{count}h ago",
  "notifications.time.days": "{count}d ago",

  "common.page": "Page {page}",
  "error.pageBody": "This page hit an unexpected error. You can try again.",
  "notifications.empty.unread.title": "Nothing unread",
  "notifications.empty.unread.body": "Everything here has been read.",
  "offline.metaTitle": "Offline",
  "offline.shortBody": "Estalvify needs a connection. Reconnect and try again.",

  // ─────────────────────────── settings ───────────────────────────
  "settings.regional.title": "Regional preferences",
  "settings.timezone.label": "Timezone",
  "settings.timezone.help": "For transaction dates.",
  "settings.currency.label": "Default currency",
  "settings.currency.help":
    "For totals; transactions keep their own currency. Shared by the whole household.",
  "settings.language.label": "Language",
  "settings.language.help": "App text and dates.",
  "settings.language.datesOnly": "dates only — app in English",
  "settings.numberFormat.label": "Number format",
  "settings.numberFormat.help": "Decimal and thousands separators.",
  "settings.savePreferences": "Save preferences",
  "settings.saveFailed": "Failed to save",
  "settings.viewer.title": "Read-only access",
  "settings.viewer.body":
    "Your role in this household is Viewer. Categories, alerts and data management are handled by the household owner and editors; the preferences above only change how the app renders for you.",
  "settings.alerts.title": "Alerts",
  "settings.alerts.threshold.label": "Low balance threshold ({currency})",
  "settings.alerts.threshold.help":
    "Warn when an account’s projected balance is set to dip below this over the next 60 days. 0 means “don’t go negative”; raise it to keep a cushion.",
  "settings.alerts.threshold.invalid": "Threshold must be a number",
  "settings.push.title": "Push notifications",
  "settings.push.deviceLabel": "Alerts on this device.",
  "settings.push.blocked": "Notifications are blocked. Allow them in browser settings.",
  "settings.push.enableFailed": "Could not enable notifications.",
  "settings.push.disableFailed": "Could not disable notifications.",
  "settings.push.needsInstall": "On iPhone, add Estalvify to your Home Screen first.",
  "settings.push.unsupported": "This browser doesn’t support push notifications.",
  "settings.push.notConfigured": "Push is not configured on this deployment.",
  "settings.push.noneSelected": "Nothing selected — alerts stay in the bell only.",
  "settings.push.sendTest": "Send test",
  "settings.push.lastError": "Last send failed: {error}",
  "settings.push.type.LOW_BALANCE_PROJECTED": "Balance won’t cover charges",
  "settings.push.type.CONSENT_EXPIRING": "Bank access expiring",
  "settings.push.type.NO_TRANSACTIONS": "Sync looks stalled",
  "settings.push.type.RECURRING_UPCOMING": "Recurring charge due",
  "settings.push.type.RECURRING_AMOUNT_CHANGE": "Recurring amount changed",
  "settings.push.type.RECURRING_MISSED": "Recurring charge missing",
  "settings.categories.title": "Categories",
  "settings.categories.description": "Personal categories and subcategories.",
  "settings.categories.empty": "No categories yet.",
  "settings.categories.count.one": "{count} subcategory",
  "settings.categories.count.other": "{count} subcategories",
  "settings.categories.addCategory": "Add category",
  "settings.categories.editCategory": "Edit category",
  "settings.categories.addSubcategory": "Add subcategory",
  "settings.categories.editSubcategory": "Edit subcategory",
  "settings.categories.deleteCategory": "Delete category",
  "settings.categories.deleteSubcategory": "Delete subcategory",
  "settings.categories.collapse": "Collapse",
  "settings.categories.expand": "Expand",
  "settings.categories.name": "Name",
  "settings.categories.namePlaceholder": "Category name",
  "settings.categories.nameRequired": "Name is required",
  "settings.categories.color": "Color",
  "settings.categories.selectColor": "Select color {color}",
  "settings.categories.delete.title": "Delete “{name}”?",
  "settings.categories.delete.children.one":
    "This will also delete its {count} subcategory.",
  "settings.categories.delete.children.other":
    "This will also delete its {count} subcategories.",
  "settings.categories.delete.transactions":
    "Any transactions categorized under “{name}” will become uncategorized.",
  "settings.categories.delete.transactionsWithChildren":
    "Any transactions categorized under “{name}” or its subcategories will become uncategorized.",
  "settings.categories.delete.irreversible": "This action cannot be undone.",
  "settings.privacy.title": "Privacy & data",
  "settings.privacy.export.title": "Export your data",
  "settings.privacy.export.body":
    "Download a JSON file with everything stored for {email}: accounts, transactions, categories, rules, plan and notifications.",
  "settings.privacy.export.action": "Download export",
  "settings.privacy.delete.title": "Delete account",
  "settings.privacy.delete.body":
    "Permanently deletes your account, revokes your bank consents and erases all your data. This cannot be undone.",
  "settings.privacy.delete.action": "Delete account…",
  "settings.privacy.delete.dialogTitle": "Delete your account?",
  "settings.privacy.delete.dialogBody":
    "This permanently removes {email}, revokes your bank consents at your banks, and erases every transaction, category, rule and plan. Consider downloading your data export first.",
  "settings.privacy.delete.confirmLabel": "Type {word} to confirm",
  "settings.privacy.delete.confirmAction": "Delete everything",
  "settings.privacy.delete.failed": "Could not delete the account. Please try again.",
  "settings.household.title": "Household",
  "settings.household.name": "Name",
  "settings.household.role.owner": "Owner",
  "settings.household.role.editor": "Editor",
  "settings.household.role.viewer": "Viewer",
  "settings.household.role.editorHelp":
    "Can categorize, edit rules, plan and manage bank connections.",
  "settings.household.role.viewerHelp": "Read-only: sees everything, changes nothing.",
  "settings.household.member": "Member",
  "settings.household.you": " (you)",
  "settings.household.roleFor": "Role for {who}",
  "settings.household.removeMember": "Remove {who}",
  "settings.household.pending": "Pending invitations",
  "settings.household.expiredSuffix": " · expired",
  "settings.household.expired": "Expired",
  "settings.household.newLinkFor": "New link for {email}",
  "settings.household.newLinkTitle": "Generate a new link (replaces this one)",
  "settings.household.revokeFor": "Revoke invitation for {email}",
  "settings.household.invite.title": "Invite someone",
  "settings.household.invite.email": "Email",
  "settings.household.invite.role": "Role",
  "settings.household.invite.roleAria": "Role for the new member",
  "settings.household.invite.action": "Create invite link",
  "settings.household.invite.working": "Working…",
  "settings.household.link.title": "Invitation link",
  "settings.household.link.body":
    "Share this link with the person you invited. It expires in 7 days, works only for their email, and is shown only now — you can generate a new one from the pending list at any time.",
  "settings.household.link.copy": "Copy link",
  "settings.household.link.done": "Done",

  // ─────────────────────────── errors & server actions ───────────────────────────
  "household.error.notFound": "Household not found",
  "household.error.invalidEmail": "Enter a valid email",
  "household.error.invalidRole": "Invalid role",
  "household.error.alreadyMember": "Already a member of this household",
  "household.error.memberNotFound": "Member not found",
  "household.error.ownerRoleFixed": "The owner’s role cannot change",
  "household.error.ownerCannotBeRemoved": "The owner cannot be removed",
  "household.error.createFailed": "Could not create the household",
  "household.error.nameRequired": "Name is required",
  "settings.push.test.noDevice": "No device is subscribed yet.",
  "settings.push.test.nothingSent": "Nothing was sent — no reachable device.",
  "settings.push.test.sent.one": "Sent to {count} device.",
  "settings.push.test.sent.other": "Sent to {count} devices.",
  "settings.push.test.title": "Test notification",
  "settings.push.test.body": "Push is working on this device.",

  // ─────────────────────────── auth / invitations / OAuth consent ───────────────────────────
  "auth.login.metaTitle": "Sign In",
  "auth.login.title": "Welcome to Estalvify",
  "auth.login.subtitle": "Your personal finance companion. Sign in to get started.",
  "auth.login.google": "Continue with Google",
  "auth.login.legal": "By signing in, you agree to our {terms} and {privacy}.",
  "auth.login.terms": "terms of service",
  "auth.login.privacy": "privacy policy",
  "auth.welcome.metaTitle": "Welcome",
  "auth.welcome.title": "Welcome to Estalvify",
  "auth.welcome.subtitle":
    "You’re signed in as {email}, but you don’t belong to any household yet.",
  "auth.welcome.pending": "Pending invitations",
  "auth.welcome.invitedBy": " · invited by {name}",
  "auth.welcome.join": "Join",
  "auth.welcome.own.title": "Start your own household",
  "auth.welcome.own.nameLabel": "Household name",
  "auth.welcome.own.namePlaceholder": "My household",
  "auth.welcome.own.action": "Create household",
  "auth.welcome.signOut.body":
    "Don’t want to set anything up? Just sign out — nothing has been created for this account.",
  "invite.error.generic": "Something went wrong. Please try again.",
  "invite.error.not_found": "This invitation link is not valid.",
  "invite.error.revoked": "This invitation was revoked. Ask for a new link.",
  "invite.error.already_accepted": "This invitation was already used.",
  "invite.error.expired": "This invitation has expired. Ask for a new link.",
  "invite.error.email_mismatch":
    "This invitation was issued for a different email address. Sign in with the invited account, or ask for a new link.",
  "invite.metaTitle": "Invitation",
  "invite.cannotAccept": "Can’t accept this invitation",
  "invite.join": "Join “{household}”",
  "invite.invitedBy": "{who} invited you to their household on Estalvify.",
  "invite.defaultInviter": "The owner",
  "invite.yourRole": "Your role",
  "invite.role.EDITOR":
    "Editor — can categorize, edit rules and the plan, and manage bank connections",
  "invite.role.VIEWER": "Viewer — read-only access to everything",
  "invite.disclaimer":
    "You’ll see this household’s accounts, transactions and plans. You can be removed by the owner at any time.",
  "invite.accept": "Accept invitation",
  "invite.goToApp": "Go to the app",
  "invite.notNow": "Not now",
  "consent.metaTitle": "Authorize access",
  "consent.invalid.title": "Invalid authorization request",
  "consent.invalid.body":
    "The connection request is missing required parameters or comes from an unknown client. Close this window and start the connection again from your MCP client.",
  "consent.title": "Authorize access to your Estalvify data",
  "consent.subtitle": "{client} wants to connect as {email}",
  "consent.household": " (household {name})",
  "consent.allows": "This will allow it to:",
  "consent.viewerNote":
    "Your role in this household is Viewer, so the connection will be read-only.",
  "consent.deny": "Deny",
  "consent.allow": "Allow",
  "consent.revokeNote":
    "You can revoke this access at any time by disconnecting the client, or from Settings by deleting your account data.",
  "mcp.scope.read": "Read your accounts, transactions, categories, rules and plan",
  "mcp.scope.write":
    "Categorize transactions, manage categories, rules and plan items, and trigger bank syncs",
} as const;

export type MessageKey = keyof typeof en;

/**
 * The base of every count-dependent message — i.e. every key that exists as
 * `<base>.one`. `Dictionary` requires both halves, so `<base>.other` is
 * guaranteed to exist alongside it.
 */
export type PluralBase = MessageKey extends infer K
  ? K extends `${infer B}.one`
    ? B
    : never
  : never;

/** Every locale must define every key — enforced by tsc, not at runtime. */
export type Dictionary = Record<MessageKey, string>;
