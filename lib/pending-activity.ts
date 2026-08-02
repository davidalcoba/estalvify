"use client";

// Shared "something is in flight" signal for the app shell.
//
// Navigations and server actions both leave the UI looking frozen while they
// resolve: a route segment is fetched over the network, a write runs on the
// server and is followed by a router.refresh(). Both publish here, and the
// single progress bar in the shell reacts to either, so every click is
// acknowledged even when the thing that changed is off screen.

import { useSyncExternalStore } from "react";

let pendingCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => pendingCount > 0;
const getServerSnapshot = () => false;

/**
 * Marks the start of some in-flight work and returns the function that ends
 * it. Ending twice is a no-op, so the returned function is safe to use
 * directly as an effect cleanup.
 */
export function beginActivity(): () => void {
  pendingCount += 1;
  emit();

  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    pendingCount -= 1;
    emit();
  };
}

/**
 * True while any navigation or server action is in flight. Subscribed with
 * useSyncExternalStore so work starting outside React's render cycle still
 * flushes to every consumer.
 */
export function usePendingActivity() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
