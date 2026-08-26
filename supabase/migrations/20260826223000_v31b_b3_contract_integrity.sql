-- COBS V3.1-B3 — Operational Excellence contract integrity
-- Persisted snapshots must be internally coherent; evidence cannot award more than possible.

alter table public.operational_excellence_snapshots
  drop constraint if exists operational_excellence_snapshots_contract_check;
alter table public.operational_excellence_snapshots
  add constraint operational_excellence_snapshots_contract_check check (
    (evaluation_status='insufficient_evidence' and score is null and rounded_score is null and classification is null and finalized_at is null)
    or
    (evaluation_status='provisional' and score between 0 and 100 and rounded_score between 0 and 100 and classification in ('gold','silver','bronze','developing') and finalized_at is null)
    or
    (evaluation_status='final' and score between 0 and 100 and rounded_score between 0 and 100 and classification in ('gold','silver','bronze','developing') and finalized_at is not null)
  );

alter table public.operational_score_evidence
  drop constraint if exists operational_score_evidence_points_check;
alter table public.operational_score_evidence
  add constraint operational_score_evidence_points_check check (
    points_awarded is null or points_possible is null
    or (points_awarded >= 0 and points_possible >= 0 and points_awarded <= points_possible)
  );
