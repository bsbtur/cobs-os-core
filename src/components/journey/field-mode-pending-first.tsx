import { useLocation } from "@tanstack/react-router";

/**
 * PX06.2 — visual-only mobile prioritization.
 * PresencePanel already derives the effective fact and marks satisfied travelers
 * with text-success. This layer only changes visual order; it never changes the
 * roster, readiness, filters, facts, or backend execution order.
 */
export function FieldModePendingFirst({ operationId }: { operationId: string }) {
  const location = useLocation();
  const isLive = location.pathname.endsWith(`/operations/${operationId}/live`);
  if (!isLive) return null;

  return (
    <style>{`
      @media (max-width: 639px) {
        /* PresencePanel is the searchable live panel. Keep pending cards first
           while preserving the original relative order inside each group. */
        .field-runtime section.surface-panel:has(input) > ul.mt-3 {
          display: flex;
          flex-direction: column;
        }

        .field-runtime section.surface-panel:has(input) > ul.mt-3 > li {
          order: 1;
        }

        .field-runtime section.surface-panel:has(input) > ul.mt-3 > li:has(span.text-success) {
          order: 2;
          opacity: 0.82;
        }
      }
    `}</style>
  );
}
