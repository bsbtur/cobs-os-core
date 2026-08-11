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
      commercial_reservations: {
        Row: {
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          expired_at: string | null
          expires_at: string | null
          id: string
          metadata: Json
          offering_id: string
          order_id: string
          order_item_id: string
          quantity: number
          reacquired_from_reservation_id: string | null
          released_at: string | null
          released_by: string | null
          released_reason: string | null
          status: Database["public"]["Enums"]["commercial_reservation_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          offering_id: string
          order_id: string
          order_item_id: string
          quantity: number
          reacquired_from_reservation_id?: string | null
          released_at?: string | null
          released_by?: string | null
          released_reason?: string | null
          status?: Database["public"]["Enums"]["commercial_reservation_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          offering_id?: string
          order_id?: string
          order_item_id?: string
          quantity?: number
          reacquired_from_reservation_id?: string | null
          released_at?: string | null
          released_by?: string | null
          released_reason?: string | null
          status?: Database["public"]["Enums"]["commercial_reservation_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_reservations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_reservations_order_id_order_item_id_fkey"
            columns: ["order_id", "order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["order_id", "id"]
          },
          {
            foreignKeyName: "commercial_reservations_reacquired_from_reservation_id_fkey"
            columns: ["reacquired_from_reservation_id"]
            isOneToOne: false
            referencedRelation: "commercial_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_reservations_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_reservations_tenant_id_offering_id_fkey"
            columns: ["tenant_id", "offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "commercial_reservations_tenant_id_order_id_fkey"
            columns: ["tenant_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "commercial_reservations_tenant_id_order_item_id_fkey"
            columns: ["tenant_id", "order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      communication_events: {
        Row: {
          actor_profile_id: string | null
          context: Json
          correlation_id: string | null
          created_at: string
          delivery_id: string | null
          event_type: Database["public"]["Enums"]["communication_event_type"]
          id: string
          message_id: string
          occurred_at: string
          operation_id: string | null
          person_id: string | null
          recipient_id: string | null
          tenant_id: string
        }
        Insert: {
          actor_profile_id?: string | null
          context?: Json
          correlation_id?: string | null
          created_at?: string
          delivery_id?: string | null
          event_type: Database["public"]["Enums"]["communication_event_type"]
          id?: string
          message_id: string
          occurred_at?: string
          operation_id?: string | null
          person_id?: string | null
          recipient_id?: string | null
          tenant_id: string
        }
        Update: {
          actor_profile_id?: string | null
          context?: Json
          correlation_id?: string | null
          created_at?: string
          delivery_id?: string | null
          event_type?: Database["public"]["Enums"]["communication_event_type"]
          id?: string
          message_id?: string
          occurred_at?: string
          operation_id?: string | null
          person_id?: string | null
          recipient_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ce_delivery_fk"
            columns: ["tenant_id", "delivery_id"]
            isOneToOne: false
            referencedRelation: "message_deliveries"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "ce_message_fk"
            columns: ["tenant_id", "message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "ce_operation_fk"
            columns: ["operation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ce_person_fk"
            columns: ["person_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "ce_recipient_fk"
            columns: ["tenant_id", "recipient_id"]
            isOneToOne: false
            referencedRelation: "message_recipients"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "communication_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          created_at: string
          created_by: string | null
          driver_code: string | null
          id: string
          is_active: boolean
          metadata: Json
          notes: string | null
          operator_name: string | null
          person_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          driver_code?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          notes?: string | null
          operator_name?: string | null
          person_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          driver_code?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          notes?: string | null
          operator_name?: string | null
          person_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drivers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_person_fk"
            columns: ["person_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "drivers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_runtime_events: {
        Row: {
          actor_profile_id: string | null
          context: Json
          correlation_id: string | null
          created_at: string
          event_id: string
          event_type: Database["public"]["Enums"]["event_runtime_event_type"]
          id: string
          note: string | null
          observed: boolean
          observed_at: string | null
          observer_note: string | null
          occurred_at: string
          operation_id: string
          recorded_at: string
          session_id: string | null
          tenant_id: string
          venue_space_id: string | null
        }
        Insert: {
          actor_profile_id?: string | null
          context?: Json
          correlation_id?: string | null
          created_at?: string
          event_id: string
          event_type: Database["public"]["Enums"]["event_runtime_event_type"]
          id?: string
          note?: string | null
          observed?: boolean
          observed_at?: string | null
          observer_note?: string | null
          occurred_at?: string
          operation_id: string
          recorded_at?: string
          session_id?: string | null
          tenant_id: string
          venue_space_id?: string | null
        }
        Update: {
          actor_profile_id?: string | null
          context?: Json
          correlation_id?: string | null
          created_at?: string
          event_id?: string
          event_type?: Database["public"]["Enums"]["event_runtime_event_type"]
          id?: string
          note?: string | null
          observed?: boolean
          observed_at?: string | null
          observer_note?: string | null
          occurred_at?: string
          operation_id?: string
          recorded_at?: string
          session_id?: string | null
          tenant_id?: string
          venue_space_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_runtime_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_runtime_events_event_id_session_id_fkey"
            columns: ["event_id", "session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["event_id", "id"]
          },
          {
            foreignKeyName: "event_runtime_events_tenant_id_event_id_fkey"
            columns: ["tenant_id", "event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "event_runtime_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_runtime_events_tenant_id_operation_id_fkey"
            columns: ["tenant_id", "operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "event_runtime_events_tenant_id_venue_space_id_fkey"
            columns: ["tenant_id", "venue_space_id"]
            isOneToOne: false
            referencedRelation: "venue_spaces"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      event_session_speakers: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          metadata: Json
          notes: string | null
          person_id: string
          presentation_title: string | null
          session_id: string
          sort_order: number
          speaking_role: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          metadata?: Json
          notes?: string | null
          person_id: string
          presentation_title?: string | null
          session_id: string
          sort_order?: number
          speaking_role?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          metadata?: Json
          notes?: string | null
          person_id?: string
          presentation_title?: string | null
          session_id?: string
          sort_order?: number
          speaking_role?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_session_speakers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_session_speakers_event_id_session_id_fkey"
            columns: ["event_id", "session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["event_id", "id"]
          },
          {
            foreignKeyName: "event_session_speakers_tenant_id_event_id_fkey"
            columns: ["tenant_id", "event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "event_session_speakers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_session_speakers_tenant_id_person_id_fkey"
            columns: ["tenant_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "event_session_speakers_tenant_id_session_id_fkey"
            columns: ["tenant_id", "session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      event_sessions: {
        Row: {
          ad_hoc_reason: string | null
          created_at: string
          created_by: string | null
          description: string | null
          event_id: string
          expected_end: string | null
          expected_start: string | null
          id: string
          is_ad_hoc: boolean
          metadata: Json
          planned_end: string | null
          planned_start: string | null
          sequence: number
          session_kind: Database["public"]["Enums"]["event_session_kind"]
          tenant_id: string
          title: string
          updated_at: string
          venue_space_id: string | null
        }
        Insert: {
          ad_hoc_reason?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id: string
          expected_end?: string | null
          expected_start?: string | null
          id?: string
          is_ad_hoc?: boolean
          metadata?: Json
          planned_end?: string | null
          planned_start?: string | null
          sequence: number
          session_kind?: Database["public"]["Enums"]["event_session_kind"]
          tenant_id: string
          title: string
          updated_at?: string
          venue_space_id?: string | null
        }
        Update: {
          ad_hoc_reason?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id?: string
          expected_end?: string | null
          expected_start?: string | null
          id?: string
          is_ad_hoc?: boolean
          metadata?: Json
          planned_end?: string | null
          planned_start?: string | null
          sequence?: number
          session_kind?: Database["public"]["Enums"]["event_session_kind"]
          tenant_id?: string
          title?: string
          updated_at?: string
          venue_space_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sessions_tenant_id_event_id_fkey"
            columns: ["tenant_id", "event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "event_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sessions_tenant_id_venue_space_id_fkey"
            columns: ["tenant_id", "venue_space_id"]
            isOneToOne: false
            referencedRelation: "venue_spaces"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      event_staff_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          metadata: Json
          notes: string | null
          person_id: string
          session_id: string | null
          staff_function: Database["public"]["Enums"]["event_staff_function"]
          tenant_id: string
          updated_at: string
          venue_space_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          metadata?: Json
          notes?: string | null
          person_id: string
          session_id?: string | null
          staff_function: Database["public"]["Enums"]["event_staff_function"]
          tenant_id: string
          updated_at?: string
          venue_space_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          metadata?: Json
          notes?: string | null
          person_id?: string
          session_id?: string | null
          staff_function?: Database["public"]["Enums"]["event_staff_function"]
          tenant_id?: string
          updated_at?: string
          venue_space_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_staff_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_staff_assignments_event_id_session_id_fkey"
            columns: ["event_id", "session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["event_id", "id"]
          },
          {
            foreignKeyName: "event_staff_assignments_tenant_id_event_id_fkey"
            columns: ["tenant_id", "event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "event_staff_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_staff_assignments_tenant_id_person_id_fkey"
            columns: ["tenant_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "event_staff_assignments_tenant_id_venue_space_id_fkey"
            columns: ["tenant_id", "venue_space_id"]
            isOneToOne: false
            referencedRelation: "venue_spaces"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      events: {
        Row: {
          closed_out_at: string | null
          created_at: string
          created_by: string | null
          expected_end: string | null
          expected_start: string | null
          external_producer_name: string | null
          id: string
          journey_step_id: string | null
          metadata: Json
          name: string
          notes: string | null
          operation_id: string
          planned_end: string
          planned_start: string
          source_kind: Database["public"]["Enums"]["event_source_kind"]
          status: Database["public"]["Enums"]["event_lifecycle_status"]
          tenant_id: string
          timezone: string
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          closed_out_at?: string | null
          created_at?: string
          created_by?: string | null
          expected_end?: string | null
          expected_start?: string | null
          external_producer_name?: string | null
          id?: string
          journey_step_id?: string | null
          metadata?: Json
          name: string
          notes?: string | null
          operation_id: string
          planned_end: string
          planned_start: string
          source_kind: Database["public"]["Enums"]["event_source_kind"]
          status?: Database["public"]["Enums"]["event_lifecycle_status"]
          tenant_id: string
          timezone: string
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          closed_out_at?: string | null
          created_at?: string
          created_by?: string | null
          expected_end?: string | null
          expected_start?: string | null
          external_producer_name?: string | null
          id?: string
          journey_step_id?: string | null
          metadata?: Json
          name?: string
          notes?: string | null
          operation_id?: string
          planned_end?: string
          planned_start?: string
          source_kind?: Database["public"]["Enums"]["event_source_kind"]
          status?: Database["public"]["Enums"]["event_lifecycle_status"]
          tenant_id?: string
          timezone?: string
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_tenant_id_journey_step_id_fkey"
            columns: ["tenant_id", "journey_step_id"]
            isOneToOne: false
            referencedRelation: "journey_steps"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "events_tenant_id_operation_id_fkey"
            columns: ["tenant_id", "operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "events_tenant_id_venue_id_fkey"
            columns: ["tenant_id", "venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["tenant_id", "id"]
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
      financial_facts: {
        Row: {
          actor_profile_id: string | null
          amount_minor: number
          context: Json
          correlation_id: string | null
          created_at: string
          currency: string
          fact_type: Database["public"]["Enums"]["financial_fact_type"]
          id: string
          method: Database["public"]["Enums"]["payment_method"] | null
          occurred_at: string
          order_id: string
          reason: string
          recorded_at: string
          reference: string | null
          references_fact_id: string | null
          tenant_id: string
        }
        Insert: {
          actor_profile_id?: string | null
          amount_minor: number
          context?: Json
          correlation_id?: string | null
          created_at?: string
          currency: string
          fact_type: Database["public"]["Enums"]["financial_fact_type"]
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          occurred_at?: string
          order_id: string
          reason: string
          recorded_at?: string
          reference?: string | null
          references_fact_id?: string | null
          tenant_id: string
        }
        Update: {
          actor_profile_id?: string | null
          amount_minor?: number
          context?: Json
          correlation_id?: string | null
          created_at?: string
          currency?: string
          fact_type?: Database["public"]["Enums"]["financial_fact_type"]
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          occurred_at?: string
          order_id?: string
          reason?: string
          recorded_at?: string
          reference?: string | null
          references_fact_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_facts_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_facts_references_fact_id_fkey"
            columns: ["references_fact_id"]
            isOneToOne: false
            referencedRelation: "financial_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_facts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_facts_tenant_id_order_id_fkey"
            columns: ["tenant_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      hospitality_events: {
        Row: {
          actor_profile_id: string | null
          context: Json
          correlation_id: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["hospitality_event_type"]
          id: string
          note: string | null
          occurred_at: string
          operation_id: string
          recorded_at: string
          room_assignment_id: string | null
          room_id: string | null
          stay_id: string
          stay_participation_id: string | null
          tenant_id: string
        }
        Insert: {
          actor_profile_id?: string | null
          context?: Json
          correlation_id?: string | null
          created_at?: string
          event_type: Database["public"]["Enums"]["hospitality_event_type"]
          id?: string
          note?: string | null
          occurred_at?: string
          operation_id: string
          recorded_at?: string
          room_assignment_id?: string | null
          room_id?: string | null
          stay_id: string
          stay_participation_id?: string | null
          tenant_id: string
        }
        Update: {
          actor_profile_id?: string | null
          context?: Json
          correlation_id?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["hospitality_event_type"]
          id?: string
          note?: string | null
          occurred_at?: string
          operation_id?: string
          recorded_at?: string
          room_assignment_id?: string | null
          room_id?: string | null
          stay_id?: string
          stay_participation_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospitality_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_events_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_events_participation_fk"
            columns: ["stay_participation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "hospitality_stay_participations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "hospitality_events_room_assignment_id_fkey"
            columns: ["room_assignment_id"]
            isOneToOne: false
            referencedRelation: "hospitality_room_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_events_room_fk"
            columns: ["room_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "hospitality_rooms"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "hospitality_events_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "hospitality_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_events_stay_fk"
            columns: ["stay_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "hospitality_stays"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "hospitality_events_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "hospitality_stays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_events_stay_participation_id_fkey"
            columns: ["stay_participation_id"]
            isOneToOne: false
            referencedRelation: "hospitality_stay_participations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitality_properties: {
        Row: {
          address_label: string | null
          city: string | null
          contact_label: string | null
          country_code: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          metadata: Json
          name: string
          notes: string | null
          property_kind: Database["public"]["Enums"]["hospitality_property_kind"]
          region: string | null
          tenant_id: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          address_label?: string | null
          city?: string | null
          contact_label?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          notes?: string | null
          property_kind?: Database["public"]["Enums"]["hospitality_property_kind"]
          region?: string | null
          tenant_id: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          address_label?: string | null
          city?: string | null
          contact_label?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          notes?: string | null
          property_kind?: Database["public"]["Enums"]["hospitality_property_kind"]
          region?: string | null
          tenant_id?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospitality_properties_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_properties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitality_room_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          correlation_id: string | null
          created_at: string
          id: string
          metadata: Json
          overcapacity_override: boolean
          override_reason: string | null
          release_reason: string | null
          released_at: string | null
          released_by: string | null
          room_id: string
          stay_id: string
          stay_participation_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          correlation_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          overcapacity_override?: boolean
          override_reason?: string | null
          release_reason?: string | null
          released_at?: string | null
          released_by?: string | null
          room_id: string
          stay_id: string
          stay_participation_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          correlation_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          overcapacity_override?: boolean
          override_reason?: string | null
          release_reason?: string | null
          released_at?: string | null
          released_by?: string | null
          room_id?: string
          stay_id?: string
          stay_participation_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospitality_room_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_room_assignments_participation_fk"
            columns: ["stay_participation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "hospitality_stay_participations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "hospitality_room_assignments_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_room_assignments_room_fk"
            columns: ["room_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "hospitality_rooms"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "hospitality_room_assignments_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "hospitality_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_room_assignments_stay_fk"
            columns: ["stay_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "hospitality_stays"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "hospitality_room_assignments_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "hospitality_stays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_room_assignments_stay_participation_id_fkey"
            columns: ["stay_participation_id"]
            isOneToOne: false
            referencedRelation: "hospitality_stay_participations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_room_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitality_rooms: {
        Row: {
          capacity: number
          created_at: string
          created_by: string | null
          floor_label: string | null
          id: string
          label: string
          metadata: Json
          notes: string | null
          room_status: Database["public"]["Enums"]["hospitality_room_status"]
          stay_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          created_by?: string | null
          floor_label?: string | null
          id?: string
          label: string
          metadata?: Json
          notes?: string | null
          room_status?: Database["public"]["Enums"]["hospitality_room_status"]
          stay_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          created_by?: string | null
          floor_label?: string | null
          id?: string
          label?: string
          metadata?: Json
          notes?: string | null
          room_status?: Database["public"]["Enums"]["hospitality_room_status"]
          stay_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospitality_rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_rooms_stay_fk"
            columns: ["stay_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "hospitality_stays"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "hospitality_rooms_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "hospitality_stays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_rooms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitality_stay_participations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          metadata: Json
          notes: string | null
          participation_id: string
          removal_reason: string | null
          removed_at: string | null
          restored_at: string | null
          stay_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          notes?: string | null
          participation_id: string
          removal_reason?: string | null
          removed_at?: string | null
          restored_at?: string | null
          stay_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          notes?: string | null
          participation_id?: string
          removal_reason?: string | null
          removed_at?: string | null
          restored_at?: string | null
          stay_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospitality_stay_participations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_stay_participations_participation_fk"
            columns: ["participation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operation_participations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "hospitality_stay_participations_participation_id_fkey"
            columns: ["participation_id"]
            isOneToOne: false
            referencedRelation: "operation_participations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_stay_participations_stay_fk"
            columns: ["stay_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "hospitality_stays"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "hospitality_stay_participations_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "hospitality_stays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_stay_participations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitality_stays: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          checkin_opened_at: string | null
          checkout_completed_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          expected_check_in: string | null
          expected_check_out: string | null
          id: string
          metadata: Json
          name: string
          notes: string | null
          operation_id: string
          planned_check_in: string
          planned_check_out: string
          property_id: string
          status: Database["public"]["Enums"]["hospitality_stay_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          checkin_opened_at?: string | null
          checkout_completed_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          expected_check_in?: string | null
          expected_check_out?: string | null
          id?: string
          metadata?: Json
          name: string
          notes?: string | null
          operation_id: string
          planned_check_in: string
          planned_check_out: string
          property_id: string
          status?: Database["public"]["Enums"]["hospitality_stay_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          checkin_opened_at?: string | null
          checkout_completed_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          expected_check_in?: string | null
          expected_check_out?: string | null
          id?: string
          metadata?: Json
          name?: string
          notes?: string | null
          operation_id?: string
          planned_check_in?: string
          planned_check_out?: string
          property_id?: string
          status?: Database["public"]["Enums"]["hospitality_stay_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospitality_stays_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_stays_operation_fk"
            columns: ["operation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "hospitality_stays_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_stays_property_fk"
            columns: ["property_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "hospitality_properties"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "hospitality_stays_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "hospitality_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_stays_tenant_id_fkey"
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
      message_audience_selectors: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          message_id: string
          participation_kind:
            | Database["public"]["Enums"]["participation_kind"]
            | null
          person_id: string | null
          role_type_id: string | null
          selector_kind: Database["public"]["Enums"]["audience_selector_kind"]
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          message_id: string
          participation_kind?:
            | Database["public"]["Enums"]["participation_kind"]
            | null
          person_id?: string | null
          role_type_id?: string | null
          selector_kind: Database["public"]["Enums"]["audience_selector_kind"]
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          message_id?: string
          participation_kind?:
            | Database["public"]["Enums"]["participation_kind"]
            | null
          person_id?: string | null
          role_type_id?: string | null
          selector_kind?: Database["public"]["Enums"]["audience_selector_kind"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mas_message_fk"
            columns: ["tenant_id", "message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "mas_person_fk"
            columns: ["person_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "mas_role_type_fk"
            columns: ["role_type_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operation_role_types"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "message_audience_selectors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_audience_selectors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      message_deliveries: {
        Row: {
          channel: Database["public"]["Enums"]["communication_channel"]
          created_at: string
          delivered_at: string
          id: string
          message_id: string
          person_id: string
          recipient_id: string
          status: Database["public"]["Enums"]["delivery_status"]
          tenant_id: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["communication_channel"]
          created_at?: string
          delivered_at?: string
          id?: string
          message_id: string
          person_id: string
          recipient_id: string
          status?: Database["public"]["Enums"]["delivery_status"]
          tenant_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["communication_channel"]
          created_at?: string
          delivered_at?: string
          id?: string
          message_id?: string
          person_id?: string
          recipient_id?: string
          status?: Database["public"]["Enums"]["delivery_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "md_message_fk"
            columns: ["tenant_id", "message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "md_person_fk"
            columns: ["person_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "md_recipient_fk"
            columns: ["tenant_id", "recipient_id"]
            isOneToOne: false
            referencedRelation: "message_recipients"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "message_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      message_recipients: {
        Row: {
          created_at: string
          first_read_at: string | null
          id: string
          in_app_eligible: boolean
          message_id: string
          person_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          first_read_at?: string | null
          id?: string
          in_app_eligible?: boolean
          message_id: string
          person_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          first_read_at?: string | null
          id?: string
          in_app_eligible?: boolean
          message_id?: string
          person_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_recipients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mr_message_fk"
            columns: ["tenant_id", "message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "mr_person_fk"
            columns: ["person_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          event_id: string | null
          event_session_id: string | null
          expires_at: string | null
          hospitality_stay_id: string | null
          id: string
          in_app_reachable_count: number
          journey_step_id: string | null
          kind: Database["public"]["Enums"]["message_kind"]
          locale: string
          metadata: Json
          operation_id: string | null
          priority: Database["public"]["Enums"]["message_priority"]
          published_at: string | null
          published_by: string | null
          recipient_count: number
          scheduled_for: string | null
          status: Database["public"]["Enums"]["message_status"]
          supersedes_message_id: string | null
          tenant_id: string
          title: string
          transport_leg_id: string | null
          updated_at: string
        }
        Insert: {
          body: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          event_session_id?: string | null
          expires_at?: string | null
          hospitality_stay_id?: string | null
          id?: string
          in_app_reachable_count?: number
          journey_step_id?: string | null
          kind?: Database["public"]["Enums"]["message_kind"]
          locale?: string
          metadata?: Json
          operation_id?: string | null
          priority?: Database["public"]["Enums"]["message_priority"]
          published_at?: string | null
          published_by?: string | null
          recipient_count?: number
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          supersedes_message_id?: string | null
          tenant_id: string
          title: string
          transport_leg_id?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          event_session_id?: string | null
          expires_at?: string | null
          hospitality_stay_id?: string | null
          id?: string
          in_app_reachable_count?: number
          journey_step_id?: string | null
          kind?: Database["public"]["Enums"]["message_kind"]
          locale?: string
          metadata?: Json
          operation_id?: string | null
          priority?: Database["public"]["Enums"]["message_priority"]
          published_at?: string | null
          published_by?: string | null
          recipient_count?: number
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          supersedes_message_id?: string | null
          tenant_id?: string
          title?: string
          transport_leg_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_event_fk"
            columns: ["tenant_id", "event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "messages_journey_step_fk"
            columns: ["journey_step_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "journey_steps"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "messages_operation_fk"
            columns: ["operation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "messages_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_session_fk"
            columns: ["event_id", "event_session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["event_id", "id"]
          },
          {
            foreignKeyName: "messages_stay_fk"
            columns: ["hospitality_stay_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "hospitality_stays"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "messages_supersedes_fk"
            columns: ["tenant_id", "supersedes_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_transport_leg_fk"
            columns: ["transport_leg_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "transport_legs"
            referencedColumns: ["id", "tenant_id"]
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
      order_items: {
        Row: {
          beneficiary_person_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          description_snapshot: string | null
          discount_minor: number
          id: string
          line_subtotal_minor: number
          line_total_minor: number
          metadata: Json
          offering_id: string | null
          order_id: string
          price_basis: Database["public"]["Enums"]["price_basis"]
          price_id: string
          quantity: number
          sellable_id: string
          sellable_kind: Database["public"]["Enums"]["sellable_kind"]
          sellable_name_snapshot: string
          snapshot_taken_at: string
          tenant_id: string
          unit_amount_minor: number
          updated_at: string
        }
        Insert: {
          beneficiary_person_id?: string | null
          created_at?: string
          created_by?: string | null
          currency: string
          description_snapshot?: string | null
          discount_minor?: number
          id?: string
          line_subtotal_minor: number
          line_total_minor: number
          metadata?: Json
          offering_id?: string | null
          order_id: string
          price_basis: Database["public"]["Enums"]["price_basis"]
          price_id: string
          quantity?: number
          sellable_id: string
          sellable_kind: Database["public"]["Enums"]["sellable_kind"]
          sellable_name_snapshot: string
          snapshot_taken_at?: string
          tenant_id: string
          unit_amount_minor: number
          updated_at?: string
        }
        Update: {
          beneficiary_person_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description_snapshot?: string | null
          discount_minor?: number
          id?: string
          line_subtotal_minor?: number
          line_total_minor?: number
          metadata?: Json
          offering_id?: string | null
          order_id?: string
          price_basis?: Database["public"]["Enums"]["price_basis"]
          price_id?: string
          quantity?: number
          sellable_id?: string
          sellable_kind?: Database["public"]["Enums"]["sellable_kind"]
          sellable_name_snapshot?: string
          snapshot_taken_at?: string
          tenant_id?: string
          unit_amount_minor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_tenant_id_beneficiary_person_id_fkey"
            columns: ["tenant_id", "beneficiary_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_tenant_id_offering_id_fkey"
            columns: ["tenant_id", "offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "order_items_tenant_id_order_id_fkey"
            columns: ["tenant_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "order_items_tenant_id_price_id_fkey"
            columns: ["tenant_id", "price_id"]
            isOneToOne: false
            referencedRelation: "prices"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "order_items_tenant_id_sellable_id_fkey"
            columns: ["tenant_id", "sellable_id"]
            isOneToOne: false
            referencedRelation: "sellables"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_name_snapshot: string | null
          buyer_person_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          completed_by: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          discount_total_minor: number | null
          grand_total_minor: number | null
          id: string
          metadata: Json
          notes: string | null
          operation_id: string | null
          reference_label: string | null
          status: Database["public"]["Enums"]["order_status"]
          submitted_at: string | null
          submitted_by: string | null
          subtotal_minor: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          buyer_name_snapshot?: string | null
          buyer_person_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          currency: string
          discount_total_minor?: number | null
          grand_total_minor?: number | null
          id?: string
          metadata?: Json
          notes?: string | null
          operation_id?: string | null
          reference_label?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          subtotal_minor?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          buyer_name_snapshot?: string | null
          buyer_person_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_total_minor?: number | null
          grand_total_minor?: number | null
          id?: string
          metadata?: Json
          notes?: string | null
          operation_id?: string | null
          reference_label?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          subtotal_minor?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_buyer_person_id_fkey"
            columns: ["tenant_id", "buyer_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_operation_id_fkey"
            columns: ["tenant_id", "operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      participant_access_grants: {
        Row: {
          activated_at: string
          created_at: string
          granted_at: string
          granted_by: string | null
          id: string
          operation_id: string
          origin: Database["public"]["Enums"]["participant_access_grant_origin"]
          participation_id: string
          person_id: string
          profile_id: string
          revoked_at: string | null
          revoked_by: string | null
          revoked_reason: string | null
          status: Database["public"]["Enums"]["participant_access_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activated_at?: string
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          operation_id: string
          origin: Database["public"]["Enums"]["participant_access_grant_origin"]
          participation_id: string
          person_id: string
          profile_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          status?: Database["public"]["Enums"]["participant_access_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activated_at?: string
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          operation_id?: string
          origin?: Database["public"]["Enums"]["participant_access_grant_origin"]
          participation_id?: string
          person_id?: string
          profile_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          status?: Database["public"]["Enums"]["participant_access_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "participant_access_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_access_grants_operation_fk"
            columns: ["operation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "participant_access_grants_participation_fk"
            columns: ["participation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operation_participations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "participant_access_grants_person_fk"
            columns: ["person_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "participant_access_grants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_access_grants_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_access_grants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      participant_access_invitations: {
        Row: {
          accepted_at: string | null
          accepted_profile_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          operation_id: string
          participation_id: string
          person_id: string
          revoked_at: string | null
          revoked_by: string | null
          revoked_reason: string | null
          tenant_id: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_profile_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          operation_id: string
          participation_id: string
          person_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          tenant_id: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_profile_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          operation_id?: string
          participation_id?: string
          person_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          tenant_id?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "participant_access_invitations_accepted_profile_id_fkey"
            columns: ["accepted_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_access_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_access_invitations_operation_fk"
            columns: ["operation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "participant_access_invitations_participation_fk"
            columns: ["participation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operation_participations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "participant_access_invitations_person_fk"
            columns: ["person_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "participant_access_invitations_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_access_invitations_tenant_id_fkey"
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
          retracts_presence_event_id: string | null
          supersedes_presence_event_id: string | null
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
          retracts_presence_event_id?: string | null
          supersedes_presence_event_id?: string | null
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
          retracts_presence_event_id?: string | null
          supersedes_presence_event_id?: string | null
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
            foreignKeyName: "participant_presence_events_retracts_presence_event_id_fkey"
            columns: ["retracts_presence_event_id"]
            isOneToOne: false
            referencedRelation: "participant_presence_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_presence_events_supersedes_presence_event_id_fkey"
            columns: ["supersedes_presence_event_id"]
            isOneToOne: false
            referencedRelation: "participant_presence_events"
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
      prices: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          metadata: Json
          price_basis: Database["public"]["Enums"]["price_basis"]
          sellable_id: string
          status: Database["public"]["Enums"]["price_status"]
          tenant_id: string
          unit_amount_minor: number
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency: string
          description?: string | null
          id?: string
          metadata?: Json
          price_basis?: Database["public"]["Enums"]["price_basis"]
          sellable_id: string
          status?: Database["public"]["Enums"]["price_status"]
          tenant_id: string
          unit_amount_minor: number
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json
          price_basis?: Database["public"]["Enums"]["price_basis"]
          sellable_id?: string
          status?: Database["public"]["Enums"]["price_status"]
          tenant_id?: string
          unit_amount_minor?: number
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prices_tenant_id_sellable_id_fkey"
            columns: ["tenant_id", "sellable_id"]
            isOneToOne: false
            referencedRelation: "sellables"
            referencedColumns: ["tenant_id", "id"]
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
      sellables: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          metadata: Json
          name: string | null
          offering_id: string | null
          sellable_kind: Database["public"]["Enums"]["sellable_kind"]
          status: Database["public"]["Enums"]["sellable_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          name?: string | null
          offering_id?: string | null
          sellable_kind: Database["public"]["Enums"]["sellable_kind"]
          status?: Database["public"]["Enums"]["sellable_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          name?: string | null
          offering_id?: string | null
          sellable_kind?: Database["public"]["Enums"]["sellable_kind"]
          status?: Database["public"]["Enums"]["sellable_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sellables_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sellables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sellables_tenant_id_offering_id_fkey"
            columns: ["tenant_id", "offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
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
      transport_events: {
        Row: {
          actor_profile_id: string | null
          context: Json
          correlation_id: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["transport_event_type"]
          id: string
          note: string | null
          occurred_at: string
          operation_id: string
          recorded_at: string
          subject_driver_id: string | null
          subject_vehicle_id: string | null
          tenant_id: string
          transport_leg_id: string | null
          transport_leg_stop_id: string | null
        }
        Insert: {
          actor_profile_id?: string | null
          context?: Json
          correlation_id?: string | null
          created_at?: string
          event_type: Database["public"]["Enums"]["transport_event_type"]
          id?: string
          note?: string | null
          occurred_at: string
          operation_id: string
          recorded_at?: string
          subject_driver_id?: string | null
          subject_vehicle_id?: string | null
          tenant_id: string
          transport_leg_id?: string | null
          transport_leg_stop_id?: string | null
        }
        Update: {
          actor_profile_id?: string | null
          context?: Json
          correlation_id?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["transport_event_type"]
          id?: string
          note?: string | null
          occurred_at?: string
          operation_id?: string
          recorded_at?: string
          subject_driver_id?: string | null
          subject_vehicle_id?: string | null
          tenant_id?: string
          transport_leg_id?: string | null
          transport_leg_stop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_events_leg_fk"
            columns: ["transport_leg_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "transport_legs"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "transport_events_operation_fk"
            columns: ["operation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "transport_events_stop_fk"
            columns: ["transport_leg_stop_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "transport_leg_stops"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "transport_events_subject_driver_fk"
            columns: ["subject_driver_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "transport_events_subject_vehicle_fk"
            columns: ["subject_vehicle_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "transport_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_leg_stops: {
        Row: {
          created_at: string
          created_by: string | null
          expected_time: string | null
          id: string
          is_pickup: boolean
          label: string
          metadata: Json
          notes: string | null
          planned_time: string | null
          sequence: number
          tenant_id: string
          transport_leg_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expected_time?: string | null
          id?: string
          is_pickup?: boolean
          label: string
          metadata?: Json
          notes?: string | null
          planned_time?: string | null
          sequence: number
          tenant_id: string
          transport_leg_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expected_time?: string | null
          id?: string
          is_pickup?: boolean
          label?: string
          metadata?: Json
          notes?: string | null
          planned_time?: string | null
          sequence?: number
          tenant_id?: string
          transport_leg_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_leg_stops_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_leg_stops_leg_fk"
            columns: ["transport_leg_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "transport_legs"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "transport_leg_stops_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_legs: {
        Row: {
          ad_hoc_reason: string | null
          capacity_override: number | null
          created_at: string
          created_by: string | null
          destination_label: string | null
          driver_id: string | null
          expected_arrival: string | null
          expected_departure: string | null
          id: string
          journey_step_id: string | null
          leg_kind: Database["public"]["Enums"]["transport_leg_kind"]
          metadata: Json
          notes: string | null
          operation_id: string
          origin_label: string | null
          plan_origin: Database["public"]["Enums"]["step_plan_origin"]
          planned_arrival: string | null
          planned_departure: string | null
          replaces_leg_id: string | null
          return_time: string | null
          return_time_note: string | null
          sequence: number
          tenant_id: string
          title: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          ad_hoc_reason?: string | null
          capacity_override?: number | null
          created_at?: string
          created_by?: string | null
          destination_label?: string | null
          driver_id?: string | null
          expected_arrival?: string | null
          expected_departure?: string | null
          id?: string
          journey_step_id?: string | null
          leg_kind?: Database["public"]["Enums"]["transport_leg_kind"]
          metadata?: Json
          notes?: string | null
          operation_id: string
          origin_label?: string | null
          plan_origin?: Database["public"]["Enums"]["step_plan_origin"]
          planned_arrival?: string | null
          planned_departure?: string | null
          replaces_leg_id?: string | null
          return_time?: string | null
          return_time_note?: string | null
          sequence: number
          tenant_id: string
          title: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          ad_hoc_reason?: string | null
          capacity_override?: number | null
          created_at?: string
          created_by?: string | null
          destination_label?: string | null
          driver_id?: string | null
          expected_arrival?: string | null
          expected_departure?: string | null
          id?: string
          journey_step_id?: string | null
          leg_kind?: Database["public"]["Enums"]["transport_leg_kind"]
          metadata?: Json
          notes?: string | null
          operation_id?: string
          origin_label?: string | null
          plan_origin?: Database["public"]["Enums"]["step_plan_origin"]
          planned_arrival?: string | null
          planned_departure?: string | null
          replaces_leg_id?: string | null
          return_time?: string | null
          return_time_note?: string | null
          sequence?: number
          tenant_id?: string
          title?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_legs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_legs_driver_fk"
            columns: ["driver_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "transport_legs_operation_fk"
            columns: ["operation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "transport_legs_replaces_leg_id_fkey"
            columns: ["replaces_leg_id"]
            isOneToOne: false
            referencedRelation: "transport_legs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_legs_step_fk"
            columns: ["journey_step_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "journey_steps"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "transport_legs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_legs_vehicle_fk"
            columns: ["vehicle_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      transport_seat_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          created_at: string
          id: string
          metadata: Json
          operation_id: string
          participation_id: string
          release_reason: string | null
          released_at: string | null
          released_by: string | null
          seat_label: string | null
          tenant_id: string
          transport_leg_id: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          operation_id: string
          participation_id: string
          release_reason?: string | null
          released_at?: string | null
          released_by?: string | null
          seat_label?: string | null
          tenant_id: string
          transport_leg_id: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          operation_id?: string
          participation_id?: string
          release_reason?: string | null
          released_at?: string | null
          released_by?: string | null
          seat_label?: string | null
          tenant_id?: string
          transport_leg_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_leg_fk"
            columns: ["transport_leg_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "transport_legs"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "seat_operation_fk"
            columns: ["operation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "seat_participation_fk"
            columns: ["participation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "operation_participations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "transport_seat_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_seat_assignments_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_seat_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          capacity: number | null
          created_at: string
          created_by: string | null
          id: string
          identifier: string | null
          is_active: boolean
          label: string
          metadata: Json
          notes: string | null
          operator_name: string | null
          tenant_id: string
          updated_at: string
          vehicle_kind: Database["public"]["Enums"]["transport_vehicle_kind"]
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          identifier?: string | null
          is_active?: boolean
          label: string
          metadata?: Json
          notes?: string | null
          operator_name?: string | null
          tenant_id: string
          updated_at?: string
          vehicle_kind?: Database["public"]["Enums"]["transport_vehicle_kind"]
        }
        Update: {
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          identifier?: string | null
          is_active?: boolean
          label?: string
          metadata?: Json
          notes?: string | null
          operator_name?: string | null
          tenant_id?: string
          updated_at?: string
          vehicle_kind?: Database["public"]["Enums"]["transport_vehicle_kind"]
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_spaces: {
        Row: {
          created_at: string
          created_by: string | null
          floor_label: string | null
          id: string
          is_active: boolean
          metadata: Json
          name: string
          notes: string | null
          planning_capacity: number | null
          space_label: string | null
          tenant_id: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          floor_label?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          notes?: string | null
          planning_capacity?: number | null
          space_label?: string | null
          tenant_id: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          floor_label?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          notes?: string | null
          planning_capacity?: number | null
          space_label?: string | null
          tenant_id?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_spaces_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_spaces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_spaces_tenant_id_venue_id_fkey"
            columns: ["tenant_id", "venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      venues: {
        Row: {
          address_label: string | null
          city: string | null
          contact_label: string | null
          country_code: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          metadata: Json
          name: string
          notes: string | null
          region: string | null
          tenant_id: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          address_label?: string | null
          city?: string | null
          contact_label?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          notes?: string | null
          region?: string | null
          tenant_id: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          address_label?: string | null
          city?: string | null
          contact_label?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          notes?: string | null
          region?: string | null
          tenant_id?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "venues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venues_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { _token: string }; Returns: Json }
      accept_participant_access_invitation: {
        Args: { _token: string }
        Returns: Json
      }
      add_message_audience_people: {
        Args: {
          _idempotency_key?: string
          _message_id: string
          _person_ids: string[]
        }
        Returns: Json
      }
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
      add_order_item: {
        Args: {
          _beneficiary_person_id?: string
          _discount_minor?: number
          _order_id: string
          _quantity?: number
          _sellable_id: string
        }
        Returns: string
      }
      add_stay_participation: {
        Args: {
          _idempotency_key: string
          _notes?: string
          _participation_id: string
          _stay_id: string
        }
        Returns: Json
      }
      add_transport_leg_stop: {
        Args: {
          _is_pickup?: boolean
          _label: string
          _notes?: string
          _planned_time?: string
          _transport_leg_id: string
        }
        Returns: Json
      }
      archive_price: { Args: { _price_id: string }; Returns: string }
      archive_sellable: { Args: { _sellable_id: string }; Returns: string }
      assign_driver_to_leg: {
        Args: {
          _driver_id: string
          _reason?: string
          _transport_leg_id: string
        }
        Returns: Json
      }
      assign_event_staff: {
        Args: {
          _event_id: string
          _idempotency_key: string
          _notes?: string
          _person_id: string
          _session_id?: string
          _staff_function: Database["public"]["Enums"]["event_staff_function"]
          _venue_space_id?: string
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
      assign_room: {
        Args: {
          _allow_overcapacity?: boolean
          _idempotency_key: string
          _reason?: string
          _room_id: string
          _stay_participation_id: string
        }
        Returns: Json
      }
      assign_seat: {
        Args: {
          _idempotency_key: string
          _participation_id: string
          _reason?: string
          _seat_label?: string
          _transport_leg_id: string
        }
        Returns: Json
      }
      assign_session_speaker: {
        Args: {
          _idempotency_key: string
          _notes?: string
          _person_id: string
          _presentation_title?: string
          _session_id: string
          _sort_order?: number
          _speaking_role?: string
        }
        Returns: Json
      }
      assign_vehicle_to_leg: {
        Args: {
          _reason?: string
          _transport_leg_id: string
          _vehicle_id: string
        }
        Returns: Json
      }
      authorize_departure: {
        Args: { _journey_step_id: string; _occurred_at?: string }
        Returns: Json
      }
      block_hospitality_room: {
        Args: { _idempotency_key: string; _reason: string; _room_id: string }
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
      cancel_event: {
        Args: {
          _event_id: string
          _idempotency_key: string
          _observed_at?: string
          _observer_note?: string
          _reason: string
        }
        Returns: Json
      }
      cancel_hospitality_stay: {
        Args: { _idempotency_key: string; _reason: string; _stay_id: string }
        Returns: Json
      }
      cancel_message: {
        Args: {
          _idempotency_key?: string
          _message_id: string
          _reason?: string
        }
        Returns: Json
      }
      cancel_order: {
        Args: { _idempotency_key?: string; _order_id: string; _reason: string }
        Returns: Json
      }
      cancel_session: {
        Args: {
          _idempotency_key: string
          _occurred_at?: string
          _reason: string
          _session_id: string
        }
        Returns: Json
      }
      cancel_transport_leg: {
        Args: { _reason: string; _transport_leg_id: string }
        Returns: Json
      }
      change_room: {
        Args: {
          _allow_overcapacity?: boolean
          _idempotency_key: string
          _reason: string
          _room_id: string
          _stay_participation_id: string
        }
        Returns: Json
      }
      change_session_space: {
        Args: {
          _idempotency_key: string
          _reason: string
          _session_id: string
          _venue_space_id: string
        }
        Returns: Json
      }
      clear_leg_assignment: {
        Args: { _reason: string; _transport_leg_id: string }
        Returns: Json
      }
      close_price: {
        Args: { _price_id: string; _valid_until: string }
        Returns: string
      }
      complete_boarding: {
        Args: { _journey_step_id: string; _occurred_at?: string }
        Returns: Json
      }
      complete_disembarkation: {
        Args: { _journey_step_id: string; _occurred_at?: string }
        Returns: Json
      }
      complete_event: {
        Args: {
          _event_id: string
          _idempotency_key: string
          _note?: string
          _occurred_at?: string
        }
        Returns: Json
      }
      complete_hospitality_stay: {
        Args: { _idempotency_key: string; _note?: string; _stay_id: string }
        Returns: Json
      }
      complete_journey_step: {
        Args: { _journey_step_id: string; _occurred_at?: string }
        Returns: Json
      }
      complete_order: {
        Args: { _idempotency_key?: string; _order_id: string }
        Returns: Json
      }
      complete_playbook_item: {
        Args: { _note?: string; _playbook_item_id: string }
        Returns: Json
      }
      complete_session: {
        Args: {
          _idempotency_key: string
          _note?: string
          _occurred_at?: string
          _session_id: string
        }
        Returns: Json
      }
      complete_stay_checkout: {
        Args: {
          _idempotency_key: string
          _note?: string
          _occurred_at?: string
          _stay_id: string
        }
        Returns: Json
      }
      confirm_hospitality_stay: {
        Args: { _idempotency_key: string; _note?: string; _stay_id: string }
        Returns: Json
      }
      confirm_order: {
        Args: { _idempotency_key?: string; _order_id: string }
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
      create_ad_hoc_session: {
        Args: {
          _ad_hoc_reason: string
          _description?: string
          _event_id: string
          _idempotency_key: string
          _planned_end?: string
          _planned_start?: string
          _session_kind?: Database["public"]["Enums"]["event_session_kind"]
          _title: string
          _venue_space_id?: string
        }
        Returns: Json
      }
      create_ad_hoc_transport_leg: {
        Args: {
          _destination_label?: string
          _expected_arrival?: string
          _expected_departure?: string
          _idempotency_key: string
          _journey_step_id?: string
          _leg_kind?: Database["public"]["Enums"]["transport_leg_kind"]
          _notes?: string
          _operation_id: string
          _origin_label?: string
          _reason: string
          _replaces_leg_id?: string
          _title: string
        }
        Returns: Json
      }
      create_correction_message: {
        Args: {
          _body?: string
          _idempotency_key?: string
          _message_id: string
          _title?: string
        }
        Returns: Json
      }
      create_driver: {
        Args: {
          _driver_code?: string
          _idempotency_key: string
          _notes?: string
          _operator_name?: string
          _person_id: string
          _tenant_id: string
        }
        Returns: Json
      }
      create_event: {
        Args: {
          _external_producer_name?: string
          _idempotency_key: string
          _name: string
          _notes?: string
          _operation_id: string
          _planned_end: string
          _planned_start: string
          _source_kind: Database["public"]["Enums"]["event_source_kind"]
          _timezone?: string
          _venue_id?: string
        }
        Returns: Json
      }
      create_event_session: {
        Args: {
          _description?: string
          _event_id: string
          _idempotency_key: string
          _planned_end?: string
          _planned_start?: string
          _session_kind?: Database["public"]["Enums"]["event_session_kind"]
          _title: string
          _venue_space_id?: string
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
      create_hospitality_property: {
        Args: {
          _address_label?: string
          _city?: string
          _contact_label?: string
          _country_code?: string
          _idempotency_key: string
          _name: string
          _notes?: string
          _property_kind?: Database["public"]["Enums"]["hospitality_property_kind"]
          _region?: string
          _tenant_id: string
          _timezone?: string
        }
        Returns: Json
      }
      create_hospitality_room: {
        Args: {
          _capacity: number
          _floor_label?: string
          _idempotency_key: string
          _label: string
          _notes?: string
          _stay_id: string
        }
        Returns: Json
      }
      create_hospitality_stay: {
        Args: {
          _idempotency_key: string
          _name: string
          _notes?: string
          _operation_id: string
          _planned_check_in: string
          _planned_check_out: string
          _property_id: string
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
      create_message: {
        Args: {
          _body: string
          _event_id?: string
          _event_session_id?: string
          _expires_at?: string
          _hospitality_stay_id?: string
          _idempotency_key?: string
          _journey_step_id?: string
          _kind?: Database["public"]["Enums"]["message_kind"]
          _locale?: string
          _operation_id?: string
          _priority?: Database["public"]["Enums"]["message_priority"]
          _tenant_id: string
          _title: string
          _transport_leg_id?: string
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
      create_order: {
        Args: {
          _buyer_person_id: string
          _currency: string
          _idempotency_key?: string
          _notes?: string
          _operation_id?: string
          _reference_label?: string
          _tenant_id: string
        }
        Returns: string
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
      create_price: {
        Args: {
          _currency: string
          _description?: string
          _price_basis?: Database["public"]["Enums"]["price_basis"]
          _sellable_id: string
          _unit_amount_minor: number
          _valid_from?: string
          _valid_until?: string
        }
        Returns: string
      }
      create_sellable: {
        Args: {
          _description?: string
          _metadata?: Json
          _name?: string
          _offering_id?: string
          _sellable_kind: Database["public"]["Enums"]["sellable_kind"]
          _tenant_id: string
        }
        Returns: string
      }
      create_transport_leg: {
        Args: {
          _destination_label?: string
          _idempotency_key: string
          _journey_step_id?: string
          _leg_kind?: Database["public"]["Enums"]["transport_leg_kind"]
          _notes?: string
          _operation_id: string
          _origin_label?: string
          _planned_arrival?: string
          _planned_departure?: string
          _title: string
        }
        Returns: Json
      }
      create_vehicle: {
        Args: {
          _capacity?: number
          _idempotency_key: string
          _identifier?: string
          _label: string
          _notes?: string
          _operator_name?: string
          _tenant_id: string
          _vehicle_kind?: Database["public"]["Enums"]["transport_vehicle_kind"]
        }
        Returns: Json
      }
      create_venue: {
        Args: {
          _address_label?: string
          _city?: string
          _contact_label?: string
          _country_code?: string
          _idempotency_key: string
          _name: string
          _notes?: string
          _region?: string
          _tenant_id: string
          _timezone?: string
        }
        Returns: Json
      }
      create_venue_space: {
        Args: {
          _floor_label?: string
          _idempotency_key: string
          _name: string
          _notes?: string
          _planning_capacity?: number
          _space_label?: string
          _venue_id: string
        }
        Returns: Json
      }
      deactivate_playbook_item: {
        Args: { _playbook_item_id: string; _reason: string }
        Returns: Json
      }
      delete_draft_message: {
        Args: { _idempotency_key?: string; _message_id: string }
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
      get_commerce_catalog: { Args: { _tenant_id: string }; Returns: Json }
      get_event_program: { Args: { _event_id: string }; Returns: Json }
      get_event_runtime_state: { Args: { _event_id: string }; Returns: Json }
      get_message_recipient_state: {
        Args: { _message_id: string }
        Returns: Json
      }
      get_my_event_program: { Args: { _operation_id: string }; Returns: Json }
      get_my_journey: { Args: { _operation_id: string }; Returns: Json }
      get_my_message_inbox: {
        Args: { _limit?: number; _tenant_id: string }
        Returns: Json
      }
      get_my_messages: { Args: { _operation_id: string }; Returns: Json }
      get_my_mobility: { Args: { _operation_id: string }; Returns: Json }
      get_my_operation_overview: {
        Args: { _operation_id: string }
        Returns: Json
      }
      get_my_operations: { Args: never; Returns: Json }
      get_my_participant_access: { Args: never; Returns: Json }
      get_my_stay: { Args: { _operation_id: string }; Returns: Json }
      get_offering_commercial_availability: {
        Args: { _offering_id: string }
        Returns: Json
      }
      get_operation_commerce_summary: {
        Args: { _operation_id: string }
        Returns: Json
      }
      get_operation_communication_feed: {
        Args: { _limit?: number; _operation_id: string }
        Returns: Json
      }
      get_order_detail: { Args: { _order_id: string }; Returns: Json }
      get_order_financial_state: { Args: { _order_id: string }; Returns: Json }
      get_venue_space_availability: {
        Args: { _from: string; _to: string; _venue_id: string }
        Returns: Json
      }
      grant_participant_access: {
        Args: {
          _idempotency_key?: string
          _operation_id: string
          _person_id: string
        }
        Returns: string
      }
      invite_participant_access: {
        Args: {
          _idempotency_key?: string
          _operation_id: string
          _person_id: string
          _ttl_hours?: number
        }
        Returns: Json
      }
      link_event_journey_step: {
        Args: {
          _event_id: string
          _idempotency_key: string
          _journey_step_id?: string
        }
        Returns: Json
      }
      link_person_to_profile: {
        Args: { _person_id: string; _profile_id: string; _tenant_id: string }
        Returns: Json
      }
      link_transport_leg_to_journey_step: {
        Args: { _journey_step_id: string; _transport_leg_id: string }
        Returns: Json
      }
      list_event_runtime_events: {
        Args: { _event_id: string; _limit?: number }
        Returns: Json
      }
      list_orders: {
        Args: {
          _limit?: number
          _operation_id?: string
          _status?: Database["public"]["Enums"]["order_status"]
          _tenant_id: string
        }
        Returns: Json
      }
      list_participant_access_grants: {
        Args: { _operation_id?: string; _tenant_id: string }
        Returns: Json
      }
      lock_event_program: {
        Args: { _event_id: string; _idempotency_key: string }
        Returns: Json
      }
      mark_event_ready: {
        Args: { _event_id: string; _idempotency_key: string }
        Returns: Json
      }
      mark_message_read: { Args: { _message_id: string }; Returns: Json }
      note_hospitality_issue: {
        Args: {
          _idempotency_key: string
          _note: string
          _occurred_at?: string
          _room_id?: string
          _stay_id: string
          _stay_participation_id?: string
        }
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
      note_transport_incident: {
        Args: {
          _note: string
          _occurred_at?: string
          _transport_leg_id: string
        }
        Returns: Json
      }
      open_stay_checkin: {
        Args: {
          _idempotency_key: string
          _note?: string
          _occurred_at?: string
          _stay_id: string
        }
        Returns: Json
      }
      pause_session: {
        Args: {
          _idempotency_key: string
          _note?: string
          _occurred_at?: string
          _session_id: string
        }
        Returns: Json
      }
      preview_audience_count: { Args: { _message_id: string }; Returns: Json }
      publish_message: {
        Args: { _idempotency_key?: string; _message_id: string }
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
      record_destination_arrived: {
        Args: {
          _note?: string
          _occurred_at?: string
          _transport_leg_id: string
        }
        Returns: Json
      }
      record_event_note: {
        Args: {
          _event_id: string
          _idempotency_key: string
          _note: string
          _session_id?: string
        }
        Returns: Json
      }
      record_guest_checked_in: {
        Args: {
          _idempotency_key: string
          _note?: string
          _occurred_at?: string
          _stay_participation_id: string
        }
        Returns: Json
      }
      record_guest_checked_out: {
        Args: {
          _idempotency_key: string
          _note?: string
          _occurred_at?: string
          _stay_participation_id: string
        }
        Returns: Json
      }
      record_guest_no_show: {
        Args: {
          _idempotency_key: string
          _occurred_at?: string
          _reason: string
          _stay_participation_id: string
        }
        Returns: Json
      }
      record_leg_departed: {
        Args: {
          _note?: string
          _occurred_at?: string
          _transport_leg_id: string
        }
        Returns: Json
      }
      record_observed_event_completed: {
        Args: {
          _event_id: string
          _idempotency_key: string
          _observed_at: string
          _observer_note: string
        }
        Returns: Json
      }
      record_observed_event_started: {
        Args: {
          _event_id: string
          _idempotency_key: string
          _observed_at: string
          _observer_note: string
        }
        Returns: Json
      }
      record_observed_session_completed: {
        Args: {
          _idempotency_key: string
          _observed_at: string
          _observer_note: string
          _session_id: string
        }
        Returns: Json
      }
      record_observed_session_started: {
        Args: {
          _idempotency_key: string
          _observed_at: string
          _observer_note: string
          _session_id: string
        }
        Returns: Json
      }
      record_payment: {
        Args: {
          _amount_minor: number
          _idempotency_key?: string
          _method: Database["public"]["Enums"]["payment_method"]
          _occurred_at?: string
          _order_id: string
          _reason: string
          _reference: string
        }
        Returns: string
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
      record_refund: {
        Args: {
          _amount_minor: number
          _idempotency_key?: string
          _occurred_at?: string
          _payment_fact_id: string
          _reason: string
          _reference: string
        }
        Returns: string
      }
      record_stop_reached: {
        Args: {
          _note?: string
          _occurred_at?: string
          _transport_leg_stop_id: string
        }
        Returns: Json
      }
      record_vehicle_at_pickup: {
        Args: {
          _note?: string
          _occurred_at?: string
          _transport_leg_id: string
        }
        Returns: Json
      }
      record_vehicle_en_route_to_pickup: {
        Args: {
          _note?: string
          _occurred_at?: string
          _transport_leg_id: string
        }
        Returns: Json
      }
      reinstate_operation: {
        Args: {
          _idempotency_key: string
          _operation_id: string
          _reason: string
        }
        Returns: Json
      }
      reinstate_participant_access: {
        Args: { _grant_id: string; _reason: string }
        Returns: boolean
      }
      release_commercial_reservation: {
        Args: { _reason: string; _reservation_id: string }
        Returns: Json
      }
      release_room: {
        Args: {
          _idempotency_key: string
          _reason: string
          _stay_participation_id: string
        }
        Returns: Json
      }
      release_seat: {
        Args: { _reason: string; _seat_assignment_id: string }
        Returns: Json
      }
      remove_event_staff: {
        Args: { _assignment_id: string; _idempotency_key: string }
        Returns: Json
      }
      remove_message_audience_selector: {
        Args: { _idempotency_key?: string; _selector_id: string }
        Returns: Json
      }
      remove_order_item: { Args: { _order_item_id: string }; Returns: boolean }
      remove_session_speaker: {
        Args: { _idempotency_key: string; _speaker_id: string }
        Returns: Json
      }
      remove_stay_participation: {
        Args: {
          _idempotency_key: string
          _reason: string
          _stay_participation_id: string
        }
        Returns: Json
      }
      remove_transport_leg_stop: {
        Args: { _reason: string; _transport_leg_stop_id: string }
        Returns: Json
      }
      reopen_event_program: {
        Args: { _event_id: string; _idempotency_key: string; _reason: string }
        Returns: Json
      }
      reopen_playbook_item: {
        Args: { _playbook_item_id: string; _reason: string }
        Returns: Json
      }
      reorder_event_sessions: {
        Args: {
          _event_id: string
          _idempotency_key: string
          _session_ids: string[]
        }
        Returns: Json
      }
      reorder_journey_steps: {
        Args: { _operation_id: string; _step_ids: string[] }
        Returns: Json
      }
      request_vehicle: {
        Args: {
          _note?: string
          _occurred_at?: string
          _transport_leg_id: string
        }
        Returns: Json
      }
      restore_stay_participation: {
        Args: {
          _idempotency_key: string
          _note?: string
          _stay_participation_id: string
        }
        Returns: Json
      }
      resume_session: {
        Args: {
          _idempotency_key: string
          _note?: string
          _occurred_at?: string
          _session_id: string
        }
        Returns: Json
      }
      retract_presence_fact: {
        Args: {
          _idempotency_key: string
          _presence_fact_id: string
          _reason: string
        }
        Returns: Json
      }
      reverse_payment: {
        Args: {
          _idempotency_key?: string
          _occurred_at?: string
          _payment_fact_id: string
          _reason: string
          _reference: string
        }
        Returns: string
      }
      revoke_participant_access: {
        Args: { _grant_id: string; _reason: string }
        Returns: boolean
      }
      revoke_participant_access_invitation: {
        Args: { _invitation_id: string; _reason: string }
        Returns: boolean
      }
      schedule_message: {
        Args: {
          _idempotency_key?: string
          _message_id: string
          _scheduled_for: string
        }
        Returns: Json
      }
      set_driver_active: {
        Args: { _driver_id: string; _is_active: boolean; _reason?: string }
        Returns: Json
      }
      set_event_expected_window: {
        Args: {
          _event_id: string
          _expected_end?: string
          _expected_start?: string
          _idempotency_key: string
          _reason: string
        }
        Returns: Json
      }
      set_hospitality_property_active: {
        Args: {
          _idempotency_key: string
          _is_active: boolean
          _property_id: string
          _reason?: string
        }
        Returns: Json
      }
      set_message_audience: {
        Args: {
          _all_participations?: boolean
          _idempotency_key?: string
          _message_id: string
          _participation_kinds?: Database["public"]["Enums"]["participation_kind"][]
          _role_type_ids?: string[]
        }
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
      set_return_time: {
        Args: {
          _note?: string
          _return_time: string
          _transport_leg_id: string
        }
        Returns: Json
      }
      set_session_expected_window: {
        Args: {
          _expected_end?: string
          _expected_start?: string
          _idempotency_key: string
          _reason: string
          _session_id: string
        }
        Returns: Json
      }
      set_stay_expected_window: {
        Args: {
          _expected_check_in?: string
          _expected_check_out?: string
          _idempotency_key: string
          _note?: string
          _stay_id: string
        }
        Returns: Json
      }
      set_stay_planned_window: {
        Args: {
          _idempotency_key: string
          _planned_check_in: string
          _planned_check_out: string
          _stay_id: string
        }
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
      set_transport_leg_expected_window: {
        Args: {
          _expected_arrival?: string
          _expected_departure?: string
          _reason: string
          _transport_leg_id: string
        }
        Returns: Json
      }
      set_transport_leg_planned_window: {
        Args: {
          _planned_arrival: string
          _planned_departure: string
          _transport_leg_id: string
        }
        Returns: Json
      }
      set_vehicle_active: {
        Args: { _is_active: boolean; _reason?: string; _vehicle_id: string }
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
      start_event: {
        Args: {
          _event_id: string
          _idempotency_key: string
          _note?: string
          _occurred_at?: string
        }
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
      start_session: {
        Args: {
          _idempotency_key: string
          _note?: string
          _occurred_at?: string
          _session_id: string
        }
        Returns: Json
      }
      submit_event_planning: {
        Args: { _event_id: string; _idempotency_key: string }
        Returns: Json
      }
      submit_order: {
        Args: { _idempotency_key?: string; _order_id: string }
        Returns: Json
      }
      unassign_operation_role: {
        Args: { _participation_id: string; _role_type_id: string }
        Returns: Json
      }
      unblock_hospitality_room: {
        Args: { _idempotency_key: string; _note?: string; _room_id: string }
        Returns: Json
      }
      unschedule_message: {
        Args: { _idempotency_key?: string; _message_id: string }
        Returns: Json
      }
      update_draft_message: {
        Args: {
          _body?: string
          _clear_expiry?: boolean
          _expires_at?: string
          _idempotency_key?: string
          _kind?: Database["public"]["Enums"]["message_kind"]
          _locale?: string
          _message_id: string
          _priority?: Database["public"]["Enums"]["message_priority"]
          _title?: string
        }
        Returns: Json
      }
      update_driver: {
        Args: {
          _driver_code?: string
          _driver_id: string
          _notes?: string
          _operator_name?: string
        }
        Returns: Json
      }
      update_event: {
        Args: {
          _event_id: string
          _external_producer_name?: string
          _idempotency_key: string
          _name?: string
          _notes?: string
          _planned_end?: string
          _planned_start?: string
          _venue_id?: string
        }
        Returns: Json
      }
      update_event_session: {
        Args: {
          _description?: string
          _idempotency_key: string
          _planned_end?: string
          _planned_start?: string
          _session_id: string
          _session_kind?: Database["public"]["Enums"]["event_session_kind"]
          _title?: string
          _venue_space_id?: string
        }
        Returns: Json
      }
      update_hospitality_property: {
        Args: {
          _address_label?: string
          _city?: string
          _contact_label?: string
          _country_code?: string
          _idempotency_key: string
          _name?: string
          _notes?: string
          _property_id: string
          _property_kind?: Database["public"]["Enums"]["hospitality_property_kind"]
          _region?: string
          _timezone?: string
        }
        Returns: Json
      }
      update_hospitality_room: {
        Args: {
          _capacity?: number
          _floor_label?: string
          _idempotency_key: string
          _label?: string
          _notes?: string
          _room_id: string
        }
        Returns: Json
      }
      update_hospitality_stay: {
        Args: {
          _idempotency_key: string
          _name?: string
          _notes?: string
          _stay_id: string
        }
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
      update_my_display_name: {
        Args: { _display_name: string; _idempotency_key: string }
        Returns: Json
      }
      update_order_details: {
        Args: {
          _notes?: string
          _operation_id?: string
          _order_id: string
          _reference_label?: string
        }
        Returns: string
      }
      update_order_item: {
        Args: {
          _beneficiary_person_id?: string
          _clear_beneficiary?: boolean
          _discount_minor?: number
          _order_item_id: string
          _quantity?: number
        }
        Returns: string
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
      update_sellable: {
        Args: {
          _description?: string
          _metadata?: Json
          _name?: string
          _sellable_id: string
        }
        Returns: string
      }
      update_transport_leg: {
        Args: {
          _capacity_override?: number
          _destination_label?: string
          _leg_kind?: Database["public"]["Enums"]["transport_leg_kind"]
          _notes?: string
          _origin_label?: string
          _title?: string
          _transport_leg_id: string
        }
        Returns: Json
      }
      update_transport_leg_stop: {
        Args: {
          _expected_time?: string
          _is_pickup?: boolean
          _label?: string
          _notes?: string
          _planned_time?: string
          _transport_leg_stop_id: string
        }
        Returns: Json
      }
      update_vehicle: {
        Args: {
          _capacity?: number
          _identifier?: string
          _label?: string
          _notes?: string
          _operator_name?: string
          _vehicle_id: string
          _vehicle_kind?: Database["public"]["Enums"]["transport_vehicle_kind"]
        }
        Returns: Json
      }
      update_venue: {
        Args: {
          _address_label?: string
          _city?: string
          _contact_label?: string
          _country_code?: string
          _idempotency_key: string
          _is_active?: boolean
          _name?: string
          _notes?: string
          _region?: string
          _timezone?: string
          _venue_id: string
        }
        Returns: Json
      }
      update_venue_space: {
        Args: {
          _floor_label?: string
          _idempotency_key: string
          _is_active?: boolean
          _name?: string
          _notes?: string
          _planning_capacity?: number
          _space_id: string
          _space_label?: string
        }
        Returns: Json
      }
      w04_operation_runtime_state: {
        Args: { _operation_id: string }
        Returns: Json
      }
      w04_step_readiness: { Args: { _step_id: string }; Returns: Json }
      w05_leg_dispatch_state: {
        Args: { _transport_leg_id: string }
        Returns: Json
      }
      w05_leg_manifest: { Args: { _transport_leg_id: string }; Returns: Json }
      w05_leg_seat_candidates: {
        Args: { _transport_leg_id: string }
        Returns: Json
      }
      w05_operation_mobility: { Args: { _operation_id: string }; Returns: Json }
      w06_operation_hospitality: {
        Args: { _operation_id: string }
        Returns: Json
      }
      w06_stay_guests: { Args: { _stay_id: string }; Returns: Json }
      w06_stay_overview: { Args: { _stay_id: string }; Returns: Json }
      w06_stay_rooming: { Args: { _stay_id: string }; Returns: Json }
    }
    Enums: {
      app_role: "owner" | "admin" | "operations_agent" | "member"
      audience_selector_kind:
        | "all_participations"
        | "participation_kind"
        | "operation_role_type"
        | "explicit_person"
      commercial_reservation_status:
        | "reserved"
        | "confirmed"
        | "released"
        | "expired"
      communication_channel: "in_app"
      communication_event_type:
        | "MESSAGE_PUBLISHED"
        | "IN_APP_DELIVERY_CREATED"
        | "MESSAGE_READ"
      delivery_status: "delivered"
      event_lifecycle_status:
        | "draft"
        | "planning"
        | "program_locked"
        | "ready"
        | "closed_out"
      event_runtime_event_type:
        | "EVENT_STARTED"
        | "EVENT_COMPLETED"
        | "EVENT_CANCELLED"
        | "EVENT_EXPECTED_TIME_CHANGED"
        | "SESSION_STARTED"
        | "SESSION_PAUSED"
        | "SESSION_RESUMED"
        | "SESSION_COMPLETED"
        | "SESSION_CANCELLED"
        | "SESSION_EXPECTED_TIME_CHANGED"
        | "SESSION_SPACE_CHANGED"
        | "EVENT_NOTE_RECORDED"
      event_session_kind:
        | "keynote"
        | "talk"
        | "panel"
        | "workshop"
        | "ceremony"
        | "performance"
        | "rehearsal"
        | "setup"
        | "teardown"
        | "break"
        | "meal"
        | "networking"
        | "other"
      event_source_kind: "internal" | "external"
      event_staff_function:
        | "producer"
        | "coordinator"
        | "stage_manager"
        | "technician"
        | "audio"
        | "lighting"
        | "video"
        | "photography"
        | "host"
        | "support"
        | "logistics"
        | "security"
        | "other"
      experience_kind: "tourism" | "event" | "hybrid"
      experience_status: "draft" | "active" | "archived"
      financial_fact_type:
        | "PAYMENT_RECORDED"
        | "PAYMENT_REVERSED"
        | "REFUND_RECORDED"
      hospitality_event_type:
        | "STAY_CONFIRMED"
        | "STAY_CANCELLED"
        | "STAY_COMPLETED"
        | "STAY_FORECAST_UPDATED"
        | "STAY_CHECKIN_OPENED"
        | "STAY_CHECKOUT_COMPLETED"
        | "ROOM_ASSIGNED"
        | "ROOM_RELEASED"
        | "ROOM_BLOCKED"
        | "ROOM_UNBLOCKED"
        | "GUEST_CHECKED_IN"
        | "GUEST_CHECKED_OUT"
        | "GUEST_NO_SHOW_RECORDED"
        | "HOSPITALITY_ISSUE_NOTED"
      hospitality_property_kind:
        | "hotel"
        | "hostel"
        | "resort"
        | "guesthouse"
        | "apartment"
        | "campus"
        | "venue"
        | "other"
      hospitality_room_status: "available" | "blocked"
      hospitality_stay_status:
        | "draft"
        | "confirmed"
        | "active"
        | "completed"
        | "cancelled"
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
      message_kind:
        | "operational"
        | "alert"
        | "instruction"
        | "reminder"
        | "update"
        | "announcement"
        | "other"
      message_priority: "normal" | "important" | "urgent"
      message_status: "draft" | "scheduled" | "published" | "cancelled"
      offering_status: "draft" | "active" | "paused" | "archived"
      operation_status:
        | "draft"
        | "planning"
        | "ready"
        | "active"
        | "completed"
        | "cancelled"
      order_status:
        | "draft"
        | "submitted"
        | "confirmed"
        | "cancelled"
        | "completed"
      participant_access_grant_origin: "operator_grant" | "invitation_claim"
      participant_access_status: "active" | "revoked"
      participation_kind: "participant" | "crew" | "support" | "observer"
      participation_status: "expected" | "confirmed" | "cancelled"
      payment_method: "cash" | "bank_transfer" | "other"
      playbook_execution_action: "completed" | "reopened"
      playbook_item_kind: "check" | "confirm" | "brief" | "verify" | "other"
      playbook_requirement: "required" | "recommended" | "informational"
      presence_fact:
        | "PRESENT_AT_MEETING_POINT"
        | "BOARDED"
        | "DISEMBARKED"
        | "ABSENCE_NOTED"
        | "NO_SHOW_CONFIRMED"
        | "PRESENCE_RETRACTED"
      price_basis: "per_person" | "per_unit" | "flat"
      price_status: "active" | "archived"
      sellable_kind:
        | "offering"
        | "merchandise"
        | "ticket"
        | "service"
        | "fee_item"
      sellable_status: "active" | "archived"
      step_plan_origin: "planned" | "ad_hoc"
      step_presence_population: "participants" | "all_confirmed"
      step_presence_requirement: "none" | "accounted" | "boarded"
      transport_dispatch_state:
        | "planned"
        | "requested"
        | "assigned"
        | "en_route_to_pickup"
        | "at_pickup"
        | "in_transit"
        | "arrived"
        | "cancelled"
      transport_event_type:
        | "LEG_CREATED"
        | "VEHICLE_REQUESTED"
        | "VEHICLE_ASSIGNED"
        | "DRIVER_ASSIGNED"
        | "ASSIGNMENT_CHANGED"
        | "ASSIGNMENT_CLEARED"
        | "VEHICLE_EN_ROUTE_TO_PICKUP"
        | "VEHICLE_AT_PICKUP"
        | "LEG_DEPARTED"
        | "STOP_REACHED"
        | "DESTINATION_ARRIVED"
        | "LEG_CANCELLED"
        | "RETURN_TIME_SET"
        | "EXPECTED_TIME_CHANGED"
        | "SEAT_ASSIGNED"
        | "SEAT_RELEASED"
        | "TRANSPORT_INCIDENT_NOTED"
      transport_leg_kind:
        | "outbound"
        | "transfer"
        | "shuttle"
        | "return"
        | "other"
      transport_vehicle_kind:
        | "bus"
        | "minibus"
        | "van"
        | "car"
        | "boat"
        | "shuttle"
        | "other"
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
      audience_selector_kind: [
        "all_participations",
        "participation_kind",
        "operation_role_type",
        "explicit_person",
      ],
      commercial_reservation_status: [
        "reserved",
        "confirmed",
        "released",
        "expired",
      ],
      communication_channel: ["in_app"],
      communication_event_type: [
        "MESSAGE_PUBLISHED",
        "IN_APP_DELIVERY_CREATED",
        "MESSAGE_READ",
      ],
      delivery_status: ["delivered"],
      event_lifecycle_status: [
        "draft",
        "planning",
        "program_locked",
        "ready",
        "closed_out",
      ],
      event_runtime_event_type: [
        "EVENT_STARTED",
        "EVENT_COMPLETED",
        "EVENT_CANCELLED",
        "EVENT_EXPECTED_TIME_CHANGED",
        "SESSION_STARTED",
        "SESSION_PAUSED",
        "SESSION_RESUMED",
        "SESSION_COMPLETED",
        "SESSION_CANCELLED",
        "SESSION_EXPECTED_TIME_CHANGED",
        "SESSION_SPACE_CHANGED",
        "EVENT_NOTE_RECORDED",
      ],
      event_session_kind: [
        "keynote",
        "talk",
        "panel",
        "workshop",
        "ceremony",
        "performance",
        "rehearsal",
        "setup",
        "teardown",
        "break",
        "meal",
        "networking",
        "other",
      ],
      event_source_kind: ["internal", "external"],
      event_staff_function: [
        "producer",
        "coordinator",
        "stage_manager",
        "technician",
        "audio",
        "lighting",
        "video",
        "photography",
        "host",
        "support",
        "logistics",
        "security",
        "other",
      ],
      experience_kind: ["tourism", "event", "hybrid"],
      experience_status: ["draft", "active", "archived"],
      financial_fact_type: [
        "PAYMENT_RECORDED",
        "PAYMENT_REVERSED",
        "REFUND_RECORDED",
      ],
      hospitality_event_type: [
        "STAY_CONFIRMED",
        "STAY_CANCELLED",
        "STAY_COMPLETED",
        "STAY_FORECAST_UPDATED",
        "STAY_CHECKIN_OPENED",
        "STAY_CHECKOUT_COMPLETED",
        "ROOM_ASSIGNED",
        "ROOM_RELEASED",
        "ROOM_BLOCKED",
        "ROOM_UNBLOCKED",
        "GUEST_CHECKED_IN",
        "GUEST_CHECKED_OUT",
        "GUEST_NO_SHOW_RECORDED",
        "HOSPITALITY_ISSUE_NOTED",
      ],
      hospitality_property_kind: [
        "hotel",
        "hostel",
        "resort",
        "guesthouse",
        "apartment",
        "campus",
        "venue",
        "other",
      ],
      hospitality_room_status: ["available", "blocked"],
      hospitality_stay_status: [
        "draft",
        "confirmed",
        "active",
        "completed",
        "cancelled",
      ],
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
      message_kind: [
        "operational",
        "alert",
        "instruction",
        "reminder",
        "update",
        "announcement",
        "other",
      ],
      message_priority: ["normal", "important", "urgent"],
      message_status: ["draft", "scheduled", "published", "cancelled"],
      offering_status: ["draft", "active", "paused", "archived"],
      operation_status: [
        "draft",
        "planning",
        "ready",
        "active",
        "completed",
        "cancelled",
      ],
      order_status: [
        "draft",
        "submitted",
        "confirmed",
        "cancelled",
        "completed",
      ],
      participant_access_grant_origin: ["operator_grant", "invitation_claim"],
      participant_access_status: ["active", "revoked"],
      participation_kind: ["participant", "crew", "support", "observer"],
      participation_status: ["expected", "confirmed", "cancelled"],
      payment_method: ["cash", "bank_transfer", "other"],
      playbook_execution_action: ["completed", "reopened"],
      playbook_item_kind: ["check", "confirm", "brief", "verify", "other"],
      playbook_requirement: ["required", "recommended", "informational"],
      presence_fact: [
        "PRESENT_AT_MEETING_POINT",
        "BOARDED",
        "DISEMBARKED",
        "ABSENCE_NOTED",
        "NO_SHOW_CONFIRMED",
        "PRESENCE_RETRACTED",
      ],
      price_basis: ["per_person", "per_unit", "flat"],
      price_status: ["active", "archived"],
      sellable_kind: [
        "offering",
        "merchandise",
        "ticket",
        "service",
        "fee_item",
      ],
      sellable_status: ["active", "archived"],
      step_plan_origin: ["planned", "ad_hoc"],
      step_presence_population: ["participants", "all_confirmed"],
      step_presence_requirement: ["none", "accounted", "boarded"],
      transport_dispatch_state: [
        "planned",
        "requested",
        "assigned",
        "en_route_to_pickup",
        "at_pickup",
        "in_transit",
        "arrived",
        "cancelled",
      ],
      transport_event_type: [
        "LEG_CREATED",
        "VEHICLE_REQUESTED",
        "VEHICLE_ASSIGNED",
        "DRIVER_ASSIGNED",
        "ASSIGNMENT_CHANGED",
        "ASSIGNMENT_CLEARED",
        "VEHICLE_EN_ROUTE_TO_PICKUP",
        "VEHICLE_AT_PICKUP",
        "LEG_DEPARTED",
        "STOP_REACHED",
        "DESTINATION_ARRIVED",
        "LEG_CANCELLED",
        "RETURN_TIME_SET",
        "EXPECTED_TIME_CHANGED",
        "SEAT_ASSIGNED",
        "SEAT_RELEASED",
        "TRANSPORT_INCIDENT_NOTED",
      ],
      transport_leg_kind: [
        "outbound",
        "transfer",
        "shuttle",
        "return",
        "other",
      ],
      transport_vehicle_kind: [
        "bus",
        "minibus",
        "van",
        "car",
        "boat",
        "shuttle",
        "other",
      ],
    },
  },
} as const
