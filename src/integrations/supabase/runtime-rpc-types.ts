export type RuntimeRpcDatabase = {
  public: {
    Functions: {
      archive_journey_step: {
        Args: {
          _journey_step_id: string;
          _reason: string;
        };
        Returns: Record<string, unknown>;
      };
      contract_operation_quote: {
        Args: {
          _quote_id: string;
          _contract_reference?: string | null;
          _contract_notes?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      create_operation_quote: {
        Args: {
          _operation_id: string;
          _supplier_name: string;
          _category: string;
          _description: string;
          _amount_minor: number;
          _valid_until?: string | null;
          _cancellation_terms?: string | null;
          _notes?: string | null;
        };
        Returns: string;
      };
      get_contract_document_pipeline_readiness: {
        Args: {
          _operation_id: string;
          _template_key?: string | null;
        };
        Returns: {
          ready: boolean;
          status: "ready" | "blocked";
          mode: string;
          template_version?: string;
          renderer_version?: string | null;
          provider_template_configured?: boolean;
          detail: string;
          note?: string;
        };
      };
      get_contract_document_source_for_admin: {
        Args: {
          _template_key: string;
          _version: string;
        };
        Returns: {
          template_id: string;
          template_key: string;
          template_version: string;
          name: string;
          status: string;
          legal_reviewed_at: string | null;
          document_source_registered: boolean;
          document_source_hash: string | null;
          document_renderer_version: string | null;
          provider_document_mode: string | null;
          can_register_source: boolean;
        };
      };
      get_operation_contract_parties: {
        Args: {
          _operation_id: string;
        };
        Returns: Array<{
          order_id: string;
          buyer_person_id: string;
          buyer_name: string;
          order_status: string;
          reservation_status: string;
          document_type: "cpf" | "passport" | "other" | null;
          document_number: string | null;
          address_line1: string | null;
          address_line2: string | null;
          district: string | null;
          city: string | null;
          state_region: string | null;
          postal_code: string | null;
          country_code: string | null;
          contract_party_profile_complete: boolean;
        }>;
      };
      get_operation_contract_readiness: {
        Args: {
          _operation_id: string;
          _template_key?: string | null;
        };
        Returns: {
          operation_id: string;
          template_key: string;
          technical_ready: boolean;
          legal_ready: boolean;
          provider_send_ready: boolean;
          checks: Array<{
            key: string;
            label: string;
            status: "ready" | "blocked";
            kind: "technical" | "legal";
            detail: string;
          }>;
          note: string;
        };
      };
      get_operation_contract_workflow: {
        Args: {
          _operation_id: string;
          _template_key?: string | null;
        };
        Returns: Array<{
          order_id: string;
          buyer_person_id: string;
          buyer_name: string;
          order_status: string;
          reservation_status: string;
          party_profile_complete: boolean;
          contract_id: string | null;
          contract_status: string | null;
          template_version: string | null;
          ready_for_render: boolean;
          document_rendered: boolean;
          document_hash: string | null;
          provider_envelope_present: boolean;
          provider_send_exposed: boolean;
        }>;
      };
      get_operation_intelligence: {
        Args: {
          _operation_id: string;
        };
        Returns: Record<string, unknown>;
      };
      get_operation_procurement_quotes: {
        Args: {
          _operation_id: string;
        };
        Returns: Array<{
          id: string;
          supplier_id: string;
          supplier_name: string;
          supplier_legal_name: string | null;
          supplier_document_number: string | null;
          supplier_address_line1: string | null;
          supplier_address_line2: string | null;
          supplier_district: string | null;
          supplier_city: string | null;
          supplier_state_region: string | null;
          supplier_postal_code: string | null;
          supplier_country_code: string | null;
          supplier_legal_evidence_complete: boolean;
          category: string;
          description: string;
          amount_minor: number;
          currency_code: string;
          status: string;
          valid_until: string | null;
          contract_reference: string | null;
          created_at: string;
        }>;
      };
      get_privacy_policy_versions_for_admin: {
        Args: {
          _tenant_id: string;
          _policy_key: string;
        };
        Returns: Array<{
          id: string;
          policy_key: string;
          version: string;
          title: string;
          effective_at: string;
          content_hash: string;
          status: string;
          created_at: string;
        }>;
      };
      publish_dynamic_operational_alert: {
        Args: {
          _operation_id: string;
          _alert_type: "time_changed" | "location_changed" | "delay";
          _title: string;
          _body: string;
          _source_kind: string;
          _source_id: string;
          _idempotency_key: string;
          _priority?: "normal" | "important" | "urgent";
        };
        Returns: Record<string, unknown>;
      };
      register_contract_document_source_draft: {
        Args: {
          _template_id: string;
          _document_source_snapshot: string;
          _renderer_version: string;
        };
        Returns: Record<string, unknown>;
      };
      register_privacy_policy_draft: {
        Args: {
          _tenant_id: string;
          _policy_key: string;
          _version: string;
          _title: string;
          _effective_at: string;
          _content_snapshot: string;
          _public_url?: string | null;
          _scope?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      select_operation_quote: {
        Args: {
          _quote_id: string;
        };
        Returns: Record<string, unknown>;
      };
      set_event_schedule_precision: {
        Args: {
          _event_id: string;
          _schedule_precision: "datetime" | "date_only";
          _idempotency_key: string;
        };
        Returns: Record<string, unknown>;
      };
      update_supplier_contract_legal_profile: {
        Args: {
          _supplier_id: string;
          _legal_name: string;
          _document_number: string;
          _address_line1: string;
          _address_line2?: string | null;
          _district?: string | null;
          _city?: string | null;
          _state_region?: string | null;
          _postal_code?: string | null;
          _country_code?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      upsert_order_contract_party_profile: {
        Args: {
          _order_id: string;
          _document_type: "cpf" | "passport" | "other";
          _document_number: string;
          _address_line1: string;
          _address_line2?: string | null;
          _district?: string | null;
          _city?: string | null;
          _state_region?: string | null;
          _postal_code?: string | null;
          _country_code?: string | null;
        };
        Returns: Record<string, unknown>;
      };
    };
  };
};