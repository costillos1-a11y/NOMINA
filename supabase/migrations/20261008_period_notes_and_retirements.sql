-- Run once in Supabase SQL Editor after the workforce classification migration.
alter table public.employees
  add column inactive_reason text,
  add column inactive_at timestamptz;

alter table public.payroll_entries
  add column notes text not null default '';
