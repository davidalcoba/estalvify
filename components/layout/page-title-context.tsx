"use client";

// Which title is on duty: the page's own or the header's.
//
// Every screen states its name twice — once as the page's `<h2>`, once in the
// sticky header — and at the top of a page that is a duplicate. It stops being
// one the moment the page scrolls: the `<h2>` leaves and the header's copy
// becomes the only thing saying where you are, which matters most on a phone,
// where the sidebar is closed.
//
// So the header's title is not removed, it is deferred: hidden while the
// page's own title is on screen, revealed as that one goes under the header.
// `PageHeader` reports its visibility here; `AppHeader` reads it.

import { createContext, useCallback, useContext, useMemo, useState } from "react";

interface PageTitleValue {
  /** True once the page's own title has scrolled out of sight. */
  collapsed: boolean;
  /** Called by `PageHeader` whenever its heading enters or leaves the viewport. */
  reportVisible: (visible: boolean) => void;
}

const PageTitleContext = createContext<PageTitleValue | null>(null);

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  // Starts visible rather than waiting for the first observer callback: a
  // navigation always lands at the top of the new page, where its title *is*
  // on screen. Assuming the opposite would flash the header's title for a
  // frame on every single navigation. Nothing resets this per route either —
  // the outgoing `PageHeader` hands the title back as it unmounts, which
  // covers the same case without watching the pathname.
  const [visible, setVisible] = useState(true);

  const reportVisible = useCallback((next: boolean) => setVisible(next), []);

  const value = useMemo(
    () => ({ collapsed: !visible, reportVisible }),
    [visible, reportVisible],
  );

  return <PageTitleContext.Provider value={value}>{children}</PageTitleContext.Provider>;
}

/**
 * Null outside the app shell — `PageHeader` is also rendered by screens that
 * have no sticky header of their own, and those simply have nothing to report.
 */
export function usePageTitle(): PageTitleValue | null {
  return useContext(PageTitleContext);
}
