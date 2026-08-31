import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";

/**
 * Generated-contract slice for Assistant Conversations.
 * Source: deployed Supabase project nktohbqmcpgonlizzcka.
 *
 * This isolates the newly deployed assistant schema until the repository's
 * complete generated Database type is refreshed as one atomic artifact.
 */
export type AssistantDatabase = Database & {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      assistant_conversations: {
        Row: {
          channel: string;
          created_at: string;
          human_available: boolean;
          id: string;
          last_message_at: string | null;
          locale: string;
          metadata: Json;
          operation_id: string | null;
          profile_id: string;
          status: string;
          tenant_id: string;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          channel?: string;
          created_at?: string;
          human_available?: boolean;
          id?: string;
          last_message_at?: string | null;
          locale?: string;
          metadata?: Json;
          operation_id?: string | null;
          profile_id: string;
          status?: string;
          tenant_id: string;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          channel?: string;
          created_at?: string;
          human_available?: boolean;
          id?: string;
          last_message_at?: string | null;
          locale?: string;
          metadata?: Json;
          operation_id?: string | null;
          profile_id?: string;
          status?: string;
          tenant_id?: string;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      assistant_conversation_messages: {
        Row: {
          automation_event_id: string | null;
          automation_result_id: string | null;
          content: string;
          conversation_id: string;
          created_at: string;
          id: string;
          metadata: Json;
          role: string;
          status: string;
          tenant_id: string;
        };
        Insert: {
          automation_event_id?: string | null;
          automation_result_id?: string | null;
          content: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          role: string;
          status?: string;
          tenant_id: string;
        };
        Update: {
          automation_event_id?: string | null;
          automation_result_id?: string | null;
          content?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          role?: string;
          status?: string;
          tenant_id?: string;
        };
        Relationships: [];
      };
    };
    Functions: Database["public"]["Functions"] & {
      assistant_create_conversation:
        | {
            Args: { _channel?: string; _locale?: string; _operation_id: string; _title?: string };
            Returns: string;
          }
        | {
            Args: {
              _channel?: string;
              _locale?: string;
              _operation_id: string;
              _tenant_id: string;
              _title?: string;
            };
            Returns: string;
          };
      assistant_submit_message: {
        Args: {
          _conversation_id: string;
          _human_available?: boolean;
          _idempotency_key?: string;
          _message: string;
        };
        Returns: { automation_event_id: string; message_id: string }[];
      };
    };
  };
};

export type AssistantSupabaseClient = SupabaseClient<AssistantDatabase>;
