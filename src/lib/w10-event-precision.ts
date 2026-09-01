import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { toPortalError } from "@/lib/w10";

export type EventSchedulePrecision = "datetime" | "date_only";
export type EventSchedulePrecisionMap = Record<string, EventSchedulePrecision>;

type Raw = Record<string, unknown>;

function obj(value: unknown): Raw {
  return value && typeof value === "object" ? (value as Raw) : {};
}

function mapPrecisionPayload(value: unknown): EventSchedulePrecisionMap {
  const root = obj(value);
  const events = Array.isArray(root["events"]) ? root["events"] : [];
  const output: EventSchedulePrecisionMap = {};

  for (const item of events) {
    const event = obj(item);
    const eventId = typeof event["event_id"] === "string" ? event["event_id"] : "";
    if (!eventId) continue;
    output[eventId] = event["schedule_precision"] === "date_only" ? "date_only" : "datetime";
  }

  return output;
}

/**
 * W10-safe companion mapper for Event Date Precision V1.
 * It calls only the already-approved get_my_event_program projection and
 * deliberately exposes only event_id -> schedule_precision to the UI.
 */
export function useMyEventSchedulePrecision(operationId: string) {
  return useQuery({
    queryKey: ["w10-portal", "operation", operationId, "event-schedule-precision"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_event_program", {
        _operation_id: operationId,
      });
      if (error) throw toPortalError(error);
      return mapPrecisionPayload(data);
    },
  });
}

export function formatDateOnlyRange(
  start: string | null,
  end: string | null,
  timeZone: string | null,
  locale: string,
) {
  if (!start) return null;
  const formatter = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  });
  const startLabel = formatter.format(new Date(start));
  if (!end) return startLabel;
  const endLabel = formatter.format(new Date(end));
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

export function timeToConfirmLabel(locale: string) {
  if (locale.toLowerCase().startsWith("pt")) return "Horário a confirmar";
  if (locale.toLowerCase().startsWith("es")) return "Horario por confirmar";
  return "Time to be confirmed";
}
