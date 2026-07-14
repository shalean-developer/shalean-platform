-- Phase 8: richer audit fields for autonomy decisions (timing, variant, fallback).

alter table public.ai_decision_logs
  add column if not exists predicted_outcome jsonb,
  add column if not exists actual_outcome jsonb,
  add column if not exists confidence double precision;

comment on column public.ai_decision_logs.predicted_outcome is 'Structured model prediction (calibration / explain).';
comment on column public.ai_decision_logs.actual_outcome is 'Observed outcome when available.';
comment on column public.ai_decision_logs.confidence is '0–1 confidence score for the logged decision.';
