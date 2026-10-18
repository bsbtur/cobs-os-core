import type { Json } from "@/integrations/supabase/types";

export const LEAD_STAGES = [
  { value: "new", label: "Novo", plural: "Novos", tone: "border-primary/40 text-primary" },
  {
    value: "contacted",
    label: "Contatado",
    plural: "Contatados",
    tone: "border-warning/40 text-warning",
  },
  {
    value: "qualified",
    label: "Qualificado",
    plural: "Qualificados",
    tone: "border-success/40 text-success",
  },
  {
    value: "converted",
    label: "Convertido",
    plural: "Convertidos",
    tone: "border-primary/40 text-primary",
  },
  {
    value: "lost",
    label: "Perdido",
    plural: "Perdidos",
    tone: "border-destructive/40 text-destructive",
  },
] as const;
export type LeadStatus = (typeof LEAD_STAGES)[number]["value"];
export type CommercialLead = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  status: string;
  source: string;
  campaign: string | null;
  metadata: Json;
  converted_person_id: string | null;
  assigned_profile_id: string | null;
  assigned_profile_name: string | null;
  assigned_at: string | null;
  status_changed_at: string;
  created_at: string;
  updated_at: string;
};
export type LeadAssignee = { profile_id: string; display_name: string; role: string };
export type LeadPipelineResult = Pick<
  CommercialLead,
  | "id"
  | "status"
  | "assigned_profile_id"
  | "assigned_profile_name"
  | "assigned_at"
  | "status_changed_at"
  | "updated_at"
>;
export type PipelineArgs = {
  _lead_id: string;
  _status?: string | null;
  _assigned_profile_id?: string | null;
  _clear_assignee?: boolean;
};
export type PipelineChange = { status?: LeadStatus; assignee?: string | null };
type PipelineRpc = (
  name: "update_commercial_lead_pipeline",
  args: PipelineArgs,
) => PromiseLike<{ data: LeadPipelineResult[] | null; error: unknown }>;

export function isLeadStatus(status: string): status is LeadStatus {
  return LEAD_STAGES.some((stage) => stage.value === status);
}
export function canManageLeadPipeline(role: string | null) {
  return role === "owner" || role === "admin";
}
export function leadStatusLabel(status: string) {
  return LEAD_STAGES.find((stage) => stage.value === status)?.label ?? "—";
}
export function leadMoveStages(lead: CommercialLead) {
  if (lead.status === "converted" || lead.converted_person_id) {
    return LEAD_STAGES.filter((stage) => stage.value === "converted");
  }
  return LEAD_STAGES.filter((stage) => stage.value !== "converted");
}
export function leadMetadata(lead: CommercialLead, key: string): string {
  const metadata = lead.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const value = metadata[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
export function whatsappUrl(phone: string) {
  const digits = phone.replace(/\D/g, "");
  // Do not guess a country code: use the canonical number supplied by the backend.
  return digits.length >= 10 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
}
export function leadStageAge(timestamp: string, now = Date.now()) {
  const entered = Date.parse(timestamp);
  if (!Number.isFinite(entered)) return "—";
  const minutes = Math.max(0, Math.floor((now - entered) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / 1440)} d`;
}
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export type LeadFilters = { search: string; assignee: string; origin: string };
export function leadOriginKey(lead: CommercialLead) {
  return JSON.stringify([lead.source, lead.campaign]);
}
export function filterLeads(leads: CommercialLead[], filters: LeadFilters) {
  const query = normalize(filters.search);
  const digits = filters.search.replace(/\D/g, "");
  return leads.filter(
    (lead) =>
      isLeadStatus(lead.status) &&
      (filters.assignee === "all" ||
        (filters.assignee === "unassigned"
          ? !lead.assigned_profile_id
          : lead.assigned_profile_id === filters.assignee)) &&
      (filters.origin === "all" || leadOriginKey(lead) === filters.origin) &&
      (!query ||
        [lead.full_name, lead.email, lead.phone].some((value) =>
          normalize(value).includes(query),
        ) ||
        (digits.length > 0 &&
          !/[a-z]/i.test(query) &&
          lead.phone.replace(/\D/g, "").includes(digits))),
  );
}
export function leadCounts(leads: CommercialLead[]) {
  return Object.fromEntries(
    LEAD_STAGES.map((stage) => [
      stage.value,
      leads.filter((lead) => lead.status === stage.value).length,
    ]),
  );
}
export function leadQueryKey(tenantId: string, profileId: string, operationId: string) {
  return ["operation-commercial-leads", tenantId, profileId, operationId] as const;
}

/** Funnel-only action. Never calls approval, Person, roster, hospitality or financial commands. */
export async function updateLeadPipeline(rpc: PipelineRpc, leadId: string, change: PipelineChange) {
  if (!leadId || (change.status === undefined && change.assignee === undefined))
    throw new Error("Invalid pipeline update");
  if (change.status !== undefined && !isLeadStatus(change.status))
    throw new Error("Invalid lead status");
  if (change.status === "converted")
    throw new Error("Converted status is managed by the canonical Person conversion flow");
  const args: PipelineArgs = { _lead_id: leadId };
  if (change.status !== undefined) args._status = change.status;
  if (change.assignee === null) args._clear_assignee = true;
  else if (change.assignee !== undefined) args._assigned_profile_id = change.assignee;
  const { data, error } = await rpc("update_commercial_lead_pipeline", args);
  if (error) throw error;
  const updated = data?.find((row) => row.id === leadId);
  if (!updated) throw new Error("Pipeline update returned no matching lead");
  return updated;
}