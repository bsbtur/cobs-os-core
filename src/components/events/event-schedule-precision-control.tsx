import { useMutation } from "@tanstack/react-query";
import { Clock3 } from "lucide-react";

import { feedback } from "@/components/feedback/feedback";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { newIdempotencyKey } from "@/lib/w07";

type EventSchedulePrecision = "datetime" | "date_only";

type Props = {
  eventId: string;
  precision: EventSchedulePrecision;
  disabled?: boolean;
  onChanged: () => void;
};

export function EventSchedulePrecisionControl({ eventId, precision, disabled, onChanged }: Props) {
  const { locale } = useI18n();
  const mutation = useMutation({
    mutationFn: async (nextPrecision: EventSchedulePrecision) => {
      const { error } = await supabase.rpc("set_event_schedule_precision", {
        _event_id: eventId,
        _schedule_precision: nextPrecision,
        _idempotency_key: newIdempotencyKey(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      feedback.success("Precisão do horário atualizada.");
      onChanged();
    },
    onError: (error) => feedback.error(humanizeError(error, locale)),
  });

  const nextPrecision: EventSchedulePrecision = precision === "date_only" ? "datetime" : "date_only";
  const label = precision === "date_only" ? "Data e horário confirmados" : "Horário a confirmar";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-2"
      disabled={disabled || mutation.isPending}
      onClick={() => mutation.mutate(nextPrecision)}
    >
      <Clock3 className="size-4" aria-hidden="true" />
      {mutation.isPending ? "Atualizando…" : label}
    </Button>
  );
}
