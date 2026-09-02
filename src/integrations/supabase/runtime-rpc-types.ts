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
      get_operation_intelligence: {
        Args: {
          _operation_id: string;
        };
        Returns: Record<string, unknown>;
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
      set_event_schedule_precision: {
        Args: {
          _event_id: string;
          _schedule_precision: "datetime" | "date_only";
          _idempotency_key: string;
        };
        Returns: Record<string, unknown>;
      };
    };
  };
};
