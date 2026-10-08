-- Run once in Supabase SQL Editor. Adds the detailed monthly controls used by the app.
alter table public.employees
  add column document_number text;

alter table public.payroll_entries
  add column additional_hours numeric(6,2) not null default 0,
  add column sunday_holiday_hours numeric(6,2) not null default 0,
  add column other_income numeric(14,2) not null default 0;

create table public.honorarium_entries (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.payroll_periods(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  quantity numeric(10,2) not null default 0,
  withholding_rate numeric(6,4) not null default 0,
  ica_rate numeric(8,5) not null default 0,
  other_withholdings numeric(14,2) not null default 0,
  notes text not null default '',
  unique(period_id, employee_id)
);

alter table public.honorarium_entries enable row level security;
create policy "honorariums: allowed branch" on public.honorarium_entries for all using (
  exists (select 1 from public.payroll_periods p where p.id = period_id and public.can_access_branch(p.branch))
) with check (
  exists (select 1 from public.payroll_periods p where p.id = period_id and public.can_access_branch(p.branch))
);
grant select, insert, update, delete on public.honorarium_entries to authenticated;
