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
    };
  };
};
