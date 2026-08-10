export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string
          actor_profile_id: string | null
          correlation_id: string | null
          id: string
          metadata: Json
          occurred_at: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          correlation_id?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          correlation_id?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      experiences: {
        Row: {
          category_tags: string[]
          city: string | null
          country_code: string | null
          created_at: string
          created_by: string | null
          default_locale: string
          default_timezone: string
          description: string | null
          experience_kind: Database["public"]["Enums"]["experience_kind"]
          id: string
          metadata: Json
          name: string
          region: string | null
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["experience_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category_tags?: string[]
          city?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          default_locale?: string
          default_timezone?: string
          description?: string | null
          experience_kind?: Database["public"]["Enums"]["experience_kind"]
          id?: string
          metadata?: Json
          name: string
          region?: string | null
          short_description?: string | null
          slug: string
          status?: Database["public"]["Enums"]["experience_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category_tags?: string[]
          city?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          default_locale?: string
          default_timezone?: string
          description?: string | null
          experience_kind?: Database["public"]["Enums"]["experience_kind"]
          id?: string
          metadata?: Json
          name?: string
          region?: string | null
          short_description?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["experience_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          action: string
          actor_profile_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          result: Json
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          result?: Json
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          result?: Json
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idempotency_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_profile_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by_profile_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          tenant_id: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_profile_id?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by_profile_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          tenant_id: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_profile_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by_profile_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          tenant_id?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_by_profile_id_fkey"
            columns: ["accepted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_profile_id_fkey"
            columns: ["invited_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_events: {
        Row: {
          actor_profile_id: string | null
          context: Json
          correlation_id: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["journey_event_type"]
          id: string
          journey_step_id: string | null
          note: string | null
          occurred_at: string
          operation_id: string
          recorded_at: string
          tenant_id: string
          traveler_visible: boolean
        }
        Insert: {
          actor_profile_id?: string | null
          context?: Json
          correlation_id?: string | null
          created_at?: string
          event_type: Database["public"]["Enums"]["journey_event_type"]
          id?: string
          journey_step_id?: string | null
          note?: string | null
          occurred_at: string
          operation_id: string
          recorded_at?: string
          tenant_id: string
          traveler_visible?: boolean
        }
        Update: {
          actor_profile_id?: string | null
          context?: Json
          correlation_id?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["journey_event_type"]
          id?: string
          journey_step_id?: string | null
          note?: string | null
          occurred_at?: string
          operation_id?: string
          recorded_at?: string
          tenant_id?: string
          traveler_visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "journey_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_events_operation_fk"
            columns: ["operation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "journey_events_step_fk"
            columns: ["journey_step_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "journey_steps"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "journey_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_steps: {
        Row: {
          ad_hoc_reason: string | null
          created_at: string
          created_by: string | null
          description: string | null
          expected_end: string | null
          expected_start: string | null
          id: string
          location_label: string | null
          metadata: Json
          operation_id: string
          plan_origin: Database["public"]["Enums"]["step_plan_origin"]
          planned_end: string | null
          planned_start: string | null
          presence_population: Database["public"]["Enums"]["step_presence_population"]
          presence_requirement: Database["public"]["Enums"]["step_presence_requirement"]
          sequence: number
          step_kind: Database["public"]["Enums"]["journey_step_kind"]
          tenant_id: string
          title: string
          traveler_facing: boolean
          traveler_label: string | null
          updated_at: string
        }
        Insert: {
          ad_hoc_reason?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expected_end?: string | null
          expected_start?: string | null
          id?: string
          location_label?: string | null
          metadata?: Json
          operation_id: string
          plan_origin?: Database["public"]["Enums"]["step_plan_origin"]
          planned_end?: string | null
          planned_start?: string | null
          presence_population?: Database["public"]["Enums"]["step_presence_population"]
          presence_requirement?: Database["public"]["Enums"]["step_presence_requirement"]
          sequence: number
          step_kind: Database["public"]["Enums"]["journey_step_kind"]
          tenant_id: string
          title: string
          traveler_facing?: boolean
          traveler_label?: string | null
          updated_at?: string
        }
        Update: {
          ad_hoc_reason?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expected_end?: string | null
          expected_start?: string | null
          id?: string
          location_label?: string | null
          metadata?: Json
          operation_id?: string
          plan_origin?: Database["public"]["Enums"]["step_plan_origin"]
          planned_end?: string | null
          planned_start?: string | null
          presence_population?: Database["public"]["Enums"]["step_presence_population"]
          presence_requirement?: Database["public"]["Enums"]["step_presence_requirement"]
          sequence?: number
          step_kind?: Database["public"]["Enums"]["journey_step_kind"]
          tenant_id?: string
          title?: string
          traveler_facing?: boolean
          traveler_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_steps_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_steps_operation_fk"
            columns: ["operation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "journey_steps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      offerings: {
        Row: {
          available_from: string | null
          available_until: string | null
          capacity: number | null
          created_at: string
          created_by: string | null
          currency_code: string | null
          experience_id: string
          id: string
          metadata: Json
          name: string
          sales_end: string | null
          sales_start: string | null
          slug: string
          status: Database["public"]["Enums"]["offering_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          available_from?: string | null
          available_until?: string | null
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          currency_code?: string | null
          experience_id: string
          id?: string
          metadata?: Json
          name: string
          sales_end?: string | null
          sales_start?: string | null
          slug: string
          status?: Database["public"]["Enums"]["offering_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          available_from?: string | null
          available_until?: string | null
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          currency_code?: string | null
          experience_id?: string
          id?: string
          metadata?: Json
          name?: string
          sales_end?: string | null
          sales_start?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["offering_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offerings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offerings_experience_fk"
            columns: ["experience_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "offerings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_participations: {
        Row: {
          cancellation_count: number
          cancellation_reason: string | null
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          operation_id: string
          participation_kind: Database["public"]["Enums"]["participation_kind"]
          person_id: string
          reactivated_at: string | null
          status: Database["public"]["Enums"]["participation_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cancellation_count?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          operation_id: string
          participation_kind?: Database["public"]["Enums"]["participation_kind"]
          person_id: string
          reactivated_at?: string | null
          status?: Database["public"]["Enums"]["participation_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cancellation_count?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          operation_id?: string
          participation_kind?: Database["public"]["Enums"]["participation_kind"]
          person_id?: string
          reactivated_at?: string | null
          status?: Database["public"]["Enums"]["participation_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_participations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_participations_operation_fk"
            columns: ["operation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "operation_participations_person_fk"
            columns: ["person_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "operation_participations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_role_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_primary: boolean
          participation_id: string
          role_type_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          participation_id: string
          role_type_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          participation_id?: string
          role_type_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_role_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_role_assignments_participation_fk"
            columns: ["participation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operation_participations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "operation_role_assignments_role_type_fk"
            columns: ["role_type_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operation_role_types"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "operation_role_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_role_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_system: boolean
          key: string
          label: string | null
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          key: string
          label?: string | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          key?: string
          label?: string | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_role_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      operations: {
        Row: {
          archived_at: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          code: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          expected_end: string | null
          expected_start: string | null
          experience_id: string | null
          id: string
          metadata: Json
          name: string
          offering_id: string | null
          operation_kind: Database["public"]["Enums"]["experience_kind"]
          planned_end: string
          planned_start: string
          primary_city: string | null
          primary_country: string
          primary_region: string | null
          source_experience_name: string | null
          source_offering_name: string | null
          status: Database["public"]["Enums"]["operation_status"]
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          code: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          expected_end?: string | null
          expected_start?: string | null
          experience_id?: string | null
          id?: string
          metadata?: Json
          name: string
          offering_id?: string | null
          operation_kind?: Database["public"]["Enums"]["experience_kind"]
          planned_end: string
          planned_start: string
          primary_city?: string | null
          primary_country: string
          primary_region?: string | null
          source_experience_name?: string | null
          source_offering_name?: string | null
          status?: Database["public"]["Enums"]["operation_status"]
          tenant_id: string
          timezone: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          code?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          expected_end?: string | null
          expected_start?: string | null
          experience_id?: string | null
          id?: string
          metadata?: Json
          name?: string
          offering_id?: string | null
          operation_kind?: Database["public"]["Enums"]["experience_kind"]
          planned_end?: string
          planned_start?: string
          primary_city?: string | null
          primary_country?: string
          primary_region?: string | null
          source_experience_name?: string | null
          source_offering_name?: string | null
          status?: Database["public"]["Enums"]["operation_status"]
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_experience_fk"
            columns: ["experience_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "operations_offering_fk"
            columns: ["offering_id", "tenant_id", "experience_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id", "tenant_id", "experience_id"]
          },
          {
            foreignKeyName: "operations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_presence_events: {
        Row: {
          actor_profile_id: string | null
          context: Json
          correlation_id: string | null
          created_at: string
          id: string
          journey_step_id: string | null
          note: string | null
          occurred_at: string
          operation_id: string
          participation_id: string
          presence_fact: Database["public"]["Enums"]["presence_fact"]
          recorded_at: string
          tenant_id: string
        }
        Insert: {
          actor_profile_id?: string | null
          context?: Json
          correlation_id?: string | null
          created_at?: string
          id?: string
          journey_step_id?: string | null
          note?: string | null
          occurred_at: string
          operation_id: string
          participation_id: string
          presence_fact: Database["public"]["Enums"]["presence_fact"]
          recorded_at?: string
          tenant_id: string
        }
        Update: {
          actor_profile_id?: string | null
          context?: Json
          correlation_id?: string | null
          created_at?: string
          id?: string
          journey_step_id?: string | null
          note?: string | null
          occurred_at?: string
          operation_id?: string
          participation_id?: string
          presence_fact?: Database["public"]["Enums"]["presence_fact"]
          recorded_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participant_presence_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_presence_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presence_operation_fk"
            columns: ["operation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "presence_participation_fk"
            columns: ["participation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operation_participations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "presence_step_fk"
            columns: ["journey_step_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "journey_steps"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      people: {
        Row: {
          country_code: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone_e164: string | null
          preferred_locale: string | null
          profile_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone_e164?: string | null
          preferred_locale?: string | null
          profile_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone_e164?: string | null
          preferred_locale?: string | null
          profile_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      playbook_executions: {
        Row: {
          actor_profile_id: string | null
          correlation_id: string | null
          created_at: string
          execution_action: Database["public"]["Enums"]["playbook_execution_action"]
          id: string
          journey_step_id: string | null
          note: string | null
          occurred_at: string
          operation_id: string
          playbook_item_id: string
          recorded_at: string
          tenant_id: string
        }
        Insert: {
          actor_profile_id?: string | null
          correlation_id?: string | null
          created_at?: string
          execution_action: Database["public"]["Enums"]["playbook_execution_action"]
          id?: string
          journey_step_id?: string | null
          note?: string | null
          occurred_at: string
          operation_id: string
          playbook_item_id: string
          recorded_at?: string
          tenant_id: string
        }
        Update: {
          actor_profile_id?: string | null
          correlation_id?: string | null
          created_at?: string
          execution_action?: Database["public"]["Enums"]["playbook_execution_action"]
          id?: string
          journey_step_id?: string | null
          note?: string | null
          occurred_at?: string
          operation_id?: string
          playbook_item_id?: string
          recorded_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbook_exec_item_fk"
            columns: ["playbook_item_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "playbook_items"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "playbook_exec_operation_fk"
            columns: ["operation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "playbook_executions_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      playbook_items: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          item_kind: Database["public"]["Enums"]["playbook_item_kind"]
          journey_step_id: string | null
          metadata: Json
          operation_id: string
          owner_role_type_id: string | null
          requirement: Database["public"]["Enums"]["playbook_requirement"]
          sequence: number
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          item_kind?: Database["public"]["Enums"]["playbook_item_kind"]
          journey_step_id?: string | null
          metadata?: Json
          operation_id: string
          owner_role_type_id?: string | null
          requirement?: Database["public"]["Enums"]["playbook_requirement"]
          sequence?: number
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          item_kind?: Database["public"]["Enums"]["playbook_item_kind"]
          journey_step_id?: string | null
          metadata?: Json
          operation_id?: string
          owner_role_type_id?: string | null
          requirement?: Database["public"]["Enums"]["playbook_requirement"]
          sequence?: number
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbook_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_items_operation_fk"
            columns: ["operation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "playbook_items_owner_role_type_id_fkey"
            columns: ["owner_role_type_id"]
            isOneToOne: false
            referencedRelation: "operation_role_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_items_step_fk"
            columns: ["journey_step_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "journey_steps"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "playbook_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          preferred_locale: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          preferred_locale?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          preferred_locale?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          country_code: string
          created_at: string
          created_by: string | null
          currency_code: string
          default_locale: string
          id: string
          name: string
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          country_code?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          default_locale?: string
          id?: string
          name: string
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          country_code?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          default_locale?: string
          id?: string
          name?: string
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { _token: string }; Returns: Json }
      add_operation_participation: {
        Args: {
          _idempotency_key: string
          _notes?: string
          _operation_id: string
          _participation_kind: Database["public"]["Enums"]["participation_kind"]
          _person_id: string
          _primary_role_type_id?: string
          _role_type_ids?: string[]
        }
        Returns: Json
      }
      assign_operation_role: {
        Args: {
          _is_primary?: boolean
          _participation_id: string
          _role_type_id: string
        }
        Returns: Json
      }
      authorize_departure: {
        Args: { _journey_step_id: string; _occurred_at?: string }
        Returns: Json
      }
      bootstrap_tenant: {
        Args: {
          _country_code?: string
          _currency_code?: string
          _default_locale?: string
          _idempotency_key?: string
          _name: string
          _slug: string
          _timezone?: string
        }
        Returns: Json
      }
      complete_boarding: {
        Args: { _journey_step_id: string; _occurred_at?: string }
        Returns: Json
      }
      complete_disembarkation: {
        Args: { _journey_step_id: string; _occurred_at?: string }
        Returns: Json
      }
      complete_journey_step: {
        Args: { _journey_step_id: string; _occurred_at?: string }
        Returns: Json
      }
      complete_playbook_item: {
        Args: { _note?: string; _playbook_item_id: string }
        Returns: Json
      }
      create_ad_hoc_journey_step: {
        Args: {
          _description?: string
          _expected_end?: string
          _expected_start?: string
          _idempotency_key: string
          _location_label?: string
          _operation_id: string
          _presence_population?: Database["public"]["Enums"]["step_presence_population"]
          _presence_requirement?: Database["public"]["Enums"]["step_presence_requirement"]
          _reason: string
          _step_kind: Database["public"]["Enums"]["journey_step_kind"]
          _title: string
          _traveler_facing?: boolean
          _traveler_label?: string
        }
        Returns: Json
      }
      create_experience: {
        Args: {
          _category_tags?: string[]
          _city?: string
          _country_code?: string
          _default_locale?: string
          _default_timezone?: string
          _description?: string
          _experience_kind: Database["public"]["Enums"]["experience_kind"]
          _idempotency_key: string
          _name: string
          _region?: string
          _short_description?: string
          _slug: string
          _tenant_id: string
        }
        Returns: Json
      }
      create_invitation: {
        Args: {
          _email: string
          _idempotency_key: string
          _role: Database["public"]["Enums"]["app_role"]
          _tenant_id: string
          _token: string
          _ttl_hours?: number
        }
        Returns: Json
      }
      create_journey_step: {
        Args: {
          _description?: string
          _idempotency_key: string
          _location_label?: string
          _operation_id: string
          _planned_end?: string
          _planned_start?: string
          _presence_population?: Database["public"]["Enums"]["step_presence_population"]
          _presence_requirement?: Database["public"]["Enums"]["step_presence_requirement"]
          _step_kind: Database["public"]["Enums"]["journey_step_kind"]
          _title: string
          _traveler_facing?: boolean
          _traveler_label?: string
        }
        Returns: Json
      }
      create_offering: {
        Args: {
          _available_from?: string
          _available_until?: string
          _capacity?: number
          _currency_code?: string
          _experience_id: string
          _idempotency_key: string
          _name: string
          _sales_end?: string
          _sales_start?: string
          _slug: string
          _tenant_id: string
        }
        Returns: Json
      }
      create_operation: {
        Args: {
          _code: string
          _experience_id?: string
          _idempotency_key: string
          _name: string
          _offering_id?: string
          _operation_kind: Database["public"]["Enums"]["experience_kind"]
          _planned_end: string
          _planned_start: string
          _primary_city?: string
          _primary_country: string
          _primary_region?: string
          _tenant_id: string
          _timezone: string
        }
        Returns: Json
      }
      create_playbook_item: {
        Args: {
          _description?: string
          _idempotency_key: string
          _item_kind?: Database["public"]["Enums"]["playbook_item_kind"]
          _journey_step_id: string
          _owner_role_type_id?: string
          _requirement?: Database["public"]["Enums"]["playbook_requirement"]
          _title: string
        }
        Returns: Json
      }
      ensure_operation_role_types: {
        Args: { _tenant_id: string }
        Returns: Json
      }
      ensure_profile: {
        Args: { _display_name?: string }
        Returns: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          preferred_locale: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      link_person_to_profile: {
        Args: { _person_id: string; _profile_id: string; _tenant_id: string }
        Returns: Json
      }
      note_incident: {
        Args: {
          _journey_step_id?: string
          _note: string
          _occurred_at?: string
          _operation_id: string
        }
        Returns: Json
      }
      record_arrival: {
        Args: { _journey_step_id: string; _occurred_at?: string }
        Returns: Json
      }
      record_departed: {
        Args: { _journey_step_id: string; _occurred_at?: string }
        Returns: Json
      }
      record_presence_fact: {
        Args: {
          _journey_step_id: string
          _note?: string
          _occurred_at?: string
          _participation_id: string
          _presence_fact: Database["public"]["Enums"]["presence_fact"]
          _reason?: string
        }
        Returns: Json
      }
      reopen_playbook_item: {
        Args: { _playbook_item_id: string; _reason: string }
        Returns: Json
      }
      reorder_journey_steps: {
        Args: { _operation_id: string; _step_ids: string[] }
        Returns: Json
      }
      set_operation_archived: {
        Args: { _archived: boolean; _operation_id: string }
        Returns: Json
      }
      set_operation_expected_window: {
        Args: {
          _expected_end: string
          _expected_start: string
          _operation_id: string
          _reason: string
        }
        Returns: Json
      }
      set_operation_planned_window: {
        Args: {
          _operation_id: string
          _planned_end: string
          _planned_start: string
          _reason?: string
        }
        Returns: Json
      }
      set_operation_status: {
        Args: {
          _operation_id: string
          _reason?: string
          _status: Database["public"]["Enums"]["operation_status"]
        }
        Returns: Json
      }
      set_participation_status: {
        Args: {
          _participation_id: string
          _reason?: string
          _status: Database["public"]["Enums"]["participation_status"]
        }
        Returns: Json
      }
      set_primary_operation_role: {
        Args: { _participation_id: string; _role_type_id: string }
        Returns: Json
      }
      set_step_expected_window: {
        Args: {
          _expected_end: string
          _expected_start: string
          _journey_step_id: string
          _reason: string
        }
        Returns: Json
      }
      skip_journey_step: {
        Args: { _journey_step_id: string; _reason: string }
        Returns: Json
      }
      start_boarding: {
        Args: { _journey_step_id: string; _occurred_at?: string }
        Returns: Json
      }
      start_gathering: {
        Args: { _journey_step_id: string; _occurred_at?: string }
        Returns: Json
      }
      start_journey_step: {
        Args: { _journey_step_id: string; _occurred_at?: string }
        Returns: Json
      }
      unassign_operation_role: {
        Args: { _participation_id: string; _role_type_id: string }
        Returns: Json
      }
      update_journey_step: {
        Args: {
          _apply_planned?: boolean
          _description?: string
          _journey_step_id: string
          _location_label?: string
          _planned_end?: string
          _planned_start?: string
          _presence_population?: Database["public"]["Enums"]["step_presence_population"]
          _presence_requirement?: Database["public"]["Enums"]["step_presence_requirement"]
          _title?: string
          _traveler_facing?: boolean
          _traveler_label?: string
        }
        Returns: Json
      }
      update_playbook_item: {
        Args: {
          _description?: string
          _is_active?: boolean
          _item_kind?: Database["public"]["Enums"]["playbook_item_kind"]
          _owner_role_type_id?: string
          _playbook_item_id: string
          _requirement?: Database["public"]["Enums"]["playbook_requirement"]
          _title?: string
        }
        Returns: Json
      }
      w04_operation_runtime_state: {
        Args: { _operation_id: string }
        Returns: Json
      }
      w04_step_readiness: { Args: { _step_id: string }; Returns: Json }
    }
    Enums: {
      app_role: "owner" | "admin" | "operations_agent" | "member"
      experience_kind: "tourism" | "event" | "hybrid"
      experience_status: "draft" | "active" | "archived"
      invitation_status: "pending" | "accepted" | "revoked"
      journey_event_type:
        | "STEP_STARTED"
        | "STEP_COMPLETED"
        | "STEP_SKIPPED"
        | "GATHERING_STARTED"
        | "BOARDING_STARTED"
        | "BOARDING_COMPLETED"
        | "DEPARTURE_AUTHORIZED"
        | "DEPARTED"
        | "ARRIVED"
        | "DISEMBARKATION_COMPLETED"
        | "EXPECTED_TIME_CHANGED"
        | "INCIDENT_NOTED"
        | "READINESS_OVERRIDDEN"
      journey_step_kind:
        | "meeting"
        | "boarding"
        | "movement"
        | "arrival"
        | "disembarkation"
        | "activity"
        | "meal"
        | "hotel"
        | "event"
        | "break"
        | "free_time"
        | "return"
        | "other"
      membership_status: "active" | "suspended"
      offering_status: "draft" | "active" | "paused" | "archived"
      operation_status:
        | "draft"
        | "planning"
        | "ready"
        | "active"
        | "completed"
        | "cancelled"
      participation_kind: "participant" | "crew" | "support" | "observer"
      participation_status: "expected" | "confirmed" | "cancelled"
      playbook_execution_action: "completed" | "reopened"
      playbook_item_kind: "check" | "confirm" | "brief" | "verify" | "other"
      playbook_requirement: "required" | "recommended" | "informational"
      presence_fact:
        | "PRESENT_AT_MEETING_POINT"
        | "BOARDED"
        | "DISEMBARKED"
        | "ABSENCE_NOTED"
        | "NO_SHOW_CONFIRMED"
      step_plan_origin: "planned" | "ad_hoc"
      step_presence_population: "participants" | "all_confirmed"
      step_presence_requirement: "none" | "accounted" | "boarded"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "admin", "operations_agent", "member"],
      experience_kind: ["tourism", "event", "hybrid"],
      experience_status: ["draft", "active", "archived"],
      invitation_status: ["pending", "accepted", "revoked"],
      journey_event_type: [
        "STEP_STARTED",
        "STEP_COMPLETED",
        "STEP_SKIPPED",
        "GATHERING_STARTED",
        "BOARDING_STARTED",
        "BOARDING_COMPLETED",
        "DEPARTURE_AUTHORIZED",
        "DEPARTED",
        "ARRIVED",
        "DISEMBARKATION_COMPLETED",
        "EXPECTED_TIME_CHANGED",
        "INCIDENT_NOTED",
        "READINESS_OVERRIDDEN",
      ],
      journey_step_kind: [
        "meeting",
        "boarding",
        "movement",
        "arrival",
        "disembarkation",
        "activity",
        "meal",
        "hotel",
        "event",
        "break",
        "free_time",
        "return",
        "other",
      ],
      membership_status: ["active", "suspended"],
      offering_status: ["draft", "active", "paused", "archived"],
      operation_status: [
        "draft",
        "planning",
        "ready",
        "active",
        "completed",
        "cancelled",
      ],
      participation_kind: ["participant", "crew", "support", "observer"],
      participation_status: ["expected", "confirmed", "cancelled"],
      playbook_execution_action: ["completed", "reopened"],
      playbook_item_kind: ["check", "confirm", "brief", "verify", "other"],
      playbook_requirement: ["required", "recommended", "informational"],
      presence_fact: [
        "PRESENT_AT_MEETING_POINT",
        "BOARDED",
        "DISEMBARKED",
        "ABSENCE_NOTED",
        "NO_SHOW_CONFIRMED",
      ],
      step_plan_origin: ["planned", "ad_hoc"],
      step_presence_population: ["participants", "all_confirmed"],
      step_presence_requirement: ["none", "accounted", "boarded"],
    },
  },
} as const
