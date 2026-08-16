import * as React from "react";
import { useLocation } from "@tanstack/react-router";

/**
 * PX06.2 / PX06.3 — visual-only mobile prioritization and rapid flow.
 * PresencePanel remains the source of effective state. This helper never writes
 * facts or readiness: it only reorders cards and, after React reflects a newly
 * resolved traveler, moves keyboard/viewport focus to the next pending action.
 */
export function FieldModePendingFirst({ operationId }: { operationId: string }) {
  const location = useLocation();
  const isLive = location.pathname.endsWith(`/operations/${operationId}/live`);

  React.useEffect(() => {
    if (!isLive || typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 639px)");
    if (!media.matches) return;

    let initialized = false;
    let previousFirstPending: HTMLElement | null = null;
    let timer: number | null = null;

    const presenceList = () =>
      document.querySelector<HTMLElement>(".field-runtime section.surface-panel:has(input) > ul.mt-3");

    const firstPending = () => {
      const list = presenceList();
      if (!list) return null;
      return Array.from(list.children).find(
        (child) => !child.querySelector("span.text-success"),
      ) as HTMLElement | undefined ?? null;
    };

    const sync = () => {
      const next = firstPending();
      if (!initialized) {
        initialized = true;
        previousFirstPending = next;
        return;
      }
      if (!next || next === previousFirstPending) return;

      previousFirstPending = next;
      const primary = next.querySelector<HTMLButtonElement>("button:not([aria-haspopup])");
      window.requestAnimationFrame(() => {
        next.scrollIntoView({ behavior: "smooth", block: "center" });
        primary?.focus({ preventScroll: true });
        next.dataset["fieldFocus"] = "true";
        window.setTimeout(() => delete next.dataset["fieldFocus"], 900);
      });
    };

    const schedule = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(sync, 80);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    sync();

    return () => {
      observer.disconnect();
      if (timer != null) window.clearTimeout(timer);
    };
  }, [isLive]);

  if (!isLive) return null;

  return (
    <style>{`
      @media (max-width: 639px) {
        .field-runtime section.surface-panel:has(input) > ul.mt-3 {
          display: flex;
          flex-direction: column;
        }

        .field-runtime section.surface-panel:has(input) > ul.mt-3 > li {
          order: 1;
          scroll-margin-block: 7rem;
          transition: opacity 180ms ease, transform 180ms ease, border-color 180ms ease;
        }

        .field-runtime section.surface-panel:has(input) > ul.mt-3 > li:has(span.text-success) {
          order: 2;
          opacity: 0.72;
        }

        .field-runtime section.surface-panel:has(input) > ul.mt-3 > li[data-field-focus="true"] {
          border-color: var(--color-primary);
          transform: translateY(-1px);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-primary) 16%, transparent);
        }
      }
    `}</style>
  );
}