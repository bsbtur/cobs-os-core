import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";

import { useTenant } from "@/lib/tenant";
import { useI18n } from "@/lib/i18n";
import { EmptyState } from "@/components/feedback/empty-state";
import { FullPageLoading } from "@/components/feedback/loading";
import { Button } from "@/components/ui/button";

/** Guard: every tenant-scoped surface needs an active organization. */
export function RequireTenant({ children }: { children: React.ReactNode }) {
  const { loading, tenant } = useTenant();
  const { t } = useI18n();

  if (loading) return <FullPageLoading />;

  if (!tenant) {
    return (
      <EmptyState
        icon={Building2}
        title={t("onboarding.empty")}
        body={t("onboarding.subtitle")}
        action={
          <Button asChild className="mt-2 min-h-11">
            <Link to="/onboarding">{t("onboarding.submit")}</Link>
          </Button>
        }
      />
    );
  }

  return <>{children}</>;
}
