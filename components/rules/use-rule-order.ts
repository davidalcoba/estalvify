"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { isSameOrder, moveItem } from "@/lib/rules/rule-order";
import type { CategoryRuleDTO } from "@/lib/rules/rule-dto";
import { reorderRules } from "@/app/(app)/rules/actions";

/**
 * Drag-to-reorder for the rules list.
 *
 * Pointer events, not HTML5 drag-and-drop: `draggable` never fires on touch, and
 * the same list has to be reorderable on the phone. The dragged row is not
 * floated — the list itself reorders live as the pointer crosses a neighbour's
 * midpoint, which keeps the markup intact (a `<tr>` cannot be transformed out of
 * its table and back). Arrow keys on the handle move a rule too, so reordering
 * doesn't require a pointer at all.
 *
 * Local order is optimistic and the server order wins again as soon as nothing is
 * in flight, so a rule created or deleted elsewhere is never dropped.
 */
export interface RuleOrderHandleProps {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
  role: "button";
  tabIndex: 0;
  "aria-label": string;
  title: string;
}

export interface RuleOrder {
  /** Rules in the order to render — local order first. */
  orderedRules: CategoryRuleDTO[];
  /** Put on the element that wraps the rows (`<tbody>`, list container). */
  containerRef: (node: HTMLElement | null) => void;
  /** Put on each row's handle; the row itself needs `data-reorder-id`. */
  handleProps: (ruleId: string) => RuleOrderHandleProps;
  draggingId: string | null;
  isSaving: boolean;
  error: string | null;
}

const ROW_SELECTOR = "[data-reorder-id]";

export function useRuleOrder(rules: CategoryRuleDTO[]): RuleOrder {
  // A string, so a re-render that merely rebuilds the array doesn't read as an
  // order change.
  const serverKey = rules.map((r) => r.id).join("|");

  const [ids, setIds] = useState<string[]>(() => splitKey(serverKey));
  const [adoptedKey, setAdoptedKey] = useState(serverKey);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [orderBeforeDrag, setOrderBeforeDrag] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  // Adopt the server order whenever no drag or save is in flight — a rule added
  // or deleted elsewhere must not be dropped by stale local state. Adjusted
  // during render (the documented way to react to a changed input) rather than in
  // an effect, so the list never paints the stale order first. Doing it while a
  // save is pending would snap back to the pre-drag order until the revalidate
  // lands.
  if (adoptedKey !== serverKey && !draggingId && !isSaving) {
    setAdoptedKey(serverKey);
    setIds(splitKey(serverKey));
  }

  const commit = useCallback(
    (next: string[]) => {
      setError(null);
      startTransition(async () => {
        try {
          await reorderRules(next);
        } catch {
          setError("Couldn't save the new order — showing the saved one.");
          setIds(splitKey(serverKey));
          setAdoptedKey(serverKey);
        }
      });
    },
    [serverKey]
  );

  // Live reordering while the pointer moves. Listeners go on the window so the
  // drag survives the pointer leaving the row it started on, and re-subscribe on
  // every order change so they always see the current one.
  useEffect(() => {
    if (!draggingId || !container) return;

    function handleMove(e: PointerEvent) {
      const from = ids.indexOf(draggingId as string);
      if (from === -1) return;

      for (const row of container!.querySelectorAll<HTMLElement>(ROW_SELECTOR)) {
        const id = row.dataset.reorderId;
        if (!id || id === draggingId) continue;

        const rect = row.getBoundingClientRect();
        if (e.clientY < rect.top || e.clientY > rect.bottom) continue;

        // Only take a neighbour's place once past its midpoint, otherwise the
        // two rows swap back and forth under a stationary pointer.
        const past = e.clientY > rect.top + rect.height / 2;
        const to = ids.indexOf(id);
        if (to !== -1 && ((to > from && past) || (to < from && !past))) {
          setIds(moveItem(ids, from, to));
        }
        return;
      }
    }

    function handleUp() {
      setDraggingId(null);
      setOrderBeforeDrag(null);
      if (orderBeforeDrag && !isSameOrder(ids, orderBeforeDrag)) commit(ids);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [draggingId, container, ids, orderBeforeDrag, commit]);

  const handleProps = useCallback(
    (ruleId: string): RuleOrderHandleProps => ({
      onPointerDown: (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        // Stops the touch gesture turning into a page scroll mid-drag.
        e.preventDefault();
        setOrderBeforeDrag(ids);
        setDraggingId(ruleId);
      },
      onKeyDown: (e) => {
        const delta = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
        if (delta === 0) return;
        e.preventDefault();
        const from = ids.indexOf(ruleId);
        const to = from + delta;
        if (from === -1 || to < 0 || to >= ids.length) return;
        const next = moveItem(ids, from, to);
        setIds(next);
        commit(next);
      },
      role: "button",
      tabIndex: 0,
      "aria-label": "Move rule earlier or later with the arrow keys",
      title: "Drag to reorder — earlier rules win",
    }),
    [ids, commit]
  );

  const orderedRules = useMemo(() => {
    const byId = new Map(rules.map((r) => [r.id, r]));
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((r): r is CategoryRuleDTO => r !== undefined);
    // A rule the local order hasn't seen yet (just created) still renders.
    const seen = new Set(ordered.map((r) => r.id));
    for (const rule of rules) if (!seen.has(rule.id)) ordered.push(rule);
    return ordered;
  }, [ids, rules]);

  return {
    orderedRules,
    containerRef: setContainer,
    handleProps,
    draggingId,
    isSaving,
    error,
  };
}

function splitKey(key: string): string[] {
  return key ? key.split("|") : [];
}
