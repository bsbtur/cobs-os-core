from pathlib import Path

path = Path("src/integrations/supabase/types.ts")
text = path.read_text()

tables = '''      journey_visit_point_events: {
        Row: {
          actor_profile_id: string | null;
          event_type: string;
          id: string;
          journey_step_id: string;
          note: string | null;
          occurred_at: string;
          operation_id: string;
          tenant_id: string;
          visit_point_id: string;
        };
        Insert: {
          actor_profile_id?: string | null;
          event_type: string;
          id?: string;
          journey_step_id: string;
          note?: string | null;
          occurred_at?: string;
          operation_id: string;
          tenant_id: string;
          visit_point_id: string;
        };
        Update: {
          actor_profile_id?: string | null;
          event_type?: string;
          id?: string;
          journey_step_id?: string;
          note?: string | null;
          occurred_at?: string;
          operation_id?: string;
          tenant_id?: string;
          visit_point_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "journey_visit_point_events_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "journey_visit_point_events_point_operation_tenant_fk";
            columns: ["visit_point_id", "operation_id", "tenant_id"];
            isOneToOne: false;
            referencedRelation: "journey_visit_points";
            referencedColumns: ["id", "operation_id", "tenant_id"];
          },
          {
            foreignKeyName: "journey_visit_point_events_step_operation_tenant_fk";
            columns: ["journey_step_id", "operation_id", "tenant_id"];
            isOneToOne: false;
            referencedRelation: "journey_steps";
            referencedColumns: ["id", "operation_id", "tenant_id"];
          },
          {
            foreignKeyName: "journey_visit_point_events_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      journey_visit_points: {
        Row: {
          created_at: string;
          created_by: string | null;
          guide_tip: string | null;
          id: string;
          interpretation: string | null;
          journey_step_id: string;
          metadata: Json;
          operation_id: string;
          sequence: number;
          tenant_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          guide_tip?: string | null;
          id?: string;
          interpretation?: string | null;
          journey_step_id: string;
          metadata?: Json;
          operation_id: string;
          sequence: number;
          tenant_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          guide_tip?: string | null;
          id?: string;
          interpretation?: string | null;
          journey_step_id?: string;
          metadata?: Json;
          operation_id?: string;
          sequence?: number;
          tenant_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "journey_visit_points_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "journey_visit_points_operation_tenant_fk";
            columns: ["operation_id", "tenant_id"];
            isOneToOne: false;
            referencedRelation: "operations";
            referencedColumns: ["id", "tenant_id"];
          },
          {
            foreignKeyName: "journey_visit_points_step_operation_tenant_fk";
            columns: ["journey_step_id", "operation_id", "tenant_id"];
            isOneToOne: false;
            referencedRelation: "journey_steps";
            referencedColumns: ["id", "operation_id", "tenant_id"];
          },
          {
            foreignKeyName: "journey_visit_points_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
'''

if "journey_visit_points: {" not in text:
    anchor = "      memberships: {"
    if anchor not in text:
        raise SystemExit("memberships table anchor missing")
    text = text.replace(anchor, tables + anchor, 1)

create_rpc = '''      create_journey_visit_point: {
        Args: {
          _guide_tip?: string;
          _interpretation?: string;
          _journey_step_id: string;
          _title: string;
        };
        Returns: Json;
      };
'''
if "      create_journey_visit_point: {" not in text:
    anchor = "      create_message: {"
    if anchor not in text:
        raise SystemExit("create_message function anchor missing")
    text = text.replace(anchor, create_rpc + anchor, 1)

status_rpc = '''      set_journey_visit_point_status: {
        Args: { _note?: string; _status: string; _visit_point_id: string };
        Returns: Json;
      };
'''
if "      set_journey_visit_point_status: {" not in text:
    anchor = "      set_message_audience: {"
    if anchor not in text:
        raise SystemExit("set_message_audience function anchor missing")
    text = text.replace(anchor, status_rpc + anchor, 1)

path.write_text(text)
