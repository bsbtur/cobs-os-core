import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";

import { useI18n } from "@/lib/i18n";
import { useMyOverview } from "@/lib/w10";
import { PortalFrame } from "@/app/portal/portal-shell";
import { PortalDenied, PortalLoadError } from "@/app/portal/portal-states";
import { FullPageLoading } from "@/components/feedback/loading";
import { isDenied } from "@/lib/w10";

/**
 * Portal operation subtree.
 * The overview projection is the single access probe for the whole subtree:
 * if the server denies it, every child renders the same generic denied state.
 */
export const Route = createFileRoute("/_authenticated/my/$operationId")({
  component: PortalOperationLayout,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function PortalOperationLayout() {
  const { operationId } = useParams({ from: "/_authenticated/my/$operationId" });
  const { t } = useI18n();

  // A non-UUID path segment can never identify an Operation. Render the same
  // participant-safe denied state and never issue a W10 RPC with it.
  if (!UUID_RE.test(operationId)) {
    return (
      <PortalFrame title={t("w10.portal.brand")}>
        <PortalDenied />
      </PortalFrame>
    );
  }

  return <PortalOperationGate operationId={operationId} />;
}

function PortalOperationGate({ operationId }: { operationId: string }) {
  const { t } = useI18n();
  const overview = useMyOverview(operationId);

  if (overview.isLoading) return <FullPageLoading />;

  if (overview.error) {
    return (
      <PortalFrame title={t("w10.portal.brand")}>
        {isDenied(overview.error) ? (
          <PortalDenied />
        ) : (
          <PortalLoadError onRetry={() => void overview.refetch()} />
        )}
      </PortalFrame>
    );
  }

  return <Outlet />;
}
