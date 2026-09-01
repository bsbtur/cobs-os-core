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
