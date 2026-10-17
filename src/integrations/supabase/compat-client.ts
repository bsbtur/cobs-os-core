import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as generatedClient } from "./client";
import type { Database, Json } from "./types";
import type { RuntimeRpcDatabase } from "./runtime-rpc-types";
import type {
  CommercialLead as PipelineLead,
  LeadAssignee,
  LeadPipelineResult,
  PipelineArgs,
} from "@/lib/commercial-leads";

type CommercialLead = {
  id: string;
  tenant_id: string;
  operation_id: string | null;
  full_name: string;
  email: string;
  phone: string;
  status: string;
  metadata: Json;
  converted_person_id: string | null;
  created_at: string;
};

// Checked-in SQL contracts missing from the generated backend snapshot.
// This changes TypeScript only: it neither creates functions nor bypasses RLS.
type CompatibilityFunctions = {
  list_orders_by_environment: {
    Args: {
      _tenant_id: string;
      _environment?: string;
      _status?: Database["public"]["Enums"]["order_status"];
      _operation_id?: string;
      _limit?: number;
    };
    Returns: Json;
  };
  list_operation_commercial_leads: {
    Args: { _operation_id: string };
    Returns: PipelineLead[];
  };
  list_commercial_lead_assignees: {
    Args: { _operation_id: string };
    Returns: LeadAssignee[];
  };
  update_commercial_lead_pipeline: {
    Args: PipelineArgs;
    Returns: LeadPipelineResult[];
  };
  get_operation_stay_capacity: {
    Args: { _operation_id: string };
    Returns: Json;
  };
  convert_commercial_lead_to_person: {
    Args: { _lead_id: string };
    Returns: Json;
  };
  approve_commercial_lead_to_operation: {
    Args: { _lead_id: string; _idempotency_key: string };
    Returns: Json;
  };
  approve_commercial_lead_to_operation_and_stay: {
    Args: { _lead_id: string; _stay_id: string; _idempotency_key: string };
    Returns: Json;
  };
  set_step_expected_window: {
    Args: {
      _journey_step_id: string;
      _expected_start: string | null;
      _expected_end: string | null;
      _reason: string;
    };
    Returns: Json;
  };
  link_transport_leg_to_journey_step: {
    Args: { _transport_leg_id: string; _journey_step_id: string | null };
    Returns: Json;
  };
};

type CompatibilityDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions" | "Tables"> & {
    Functions: Omit<
      Database["public"]["Functions"] & RuntimeRpcDatabase["public"]["Functions"],
      keyof CompatibilityFunctions
    > &
      CompatibilityFunctions;
    Tables: Database["public"]["Tables"] & {
      commercial_leads: {
        Row: CommercialLead;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
  };
};

// Reuse the generated session, transport and credentials without a second client.
export const supabase = generatedClient as unknown as SupabaseClient<CompatibilityDatabase>;
