import { toast } from "sonner";
import { CheckCircle2, CircleAlert, Info, TriangleAlert } from "lucide-react";

/**
 * Feedback primitives — the single approved channel for transient success/error signals.
 * Components must never call `sonner` directly, so tone stays consistent across domains.
 */

export const feedback = {
  success(message: string, description?: string) {
    return toast.success(message, {
      description,
      icon: <CheckCircle2 className="size-4 text-success" aria-hidden="true" />,
    });
  },
  error(message: string, description?: string) {
    return toast.error(message, {
      description,
      icon: <CircleAlert className="size-4 text-destructive" aria-hidden="true" />,
    });
  },
  warning(message: string, description?: string) {
    return toast.warning(message, {
      description,
      icon: <TriangleAlert className="size-4 text-warning" aria-hidden="true" />,
    });
  },
  info(message: string, description?: string) {
    return toast(message, {
      description,
      icon: <Info className="size-4 text-primary" aria-hidden="true" />,
    });
  },
};
