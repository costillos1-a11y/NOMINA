-- Neumovida payroll: execute once in a new Supabase project.
create type public.branch_code as enum ('MANIZALES', 'ARMENIA');
create type public.app_role as enum ('MANAGER_MANIZALES', 'MANAGER_ARMENIA');
create type public.period_status as enum ('DRAFT', 'CLOSED');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  branch public.branch_code not null,
  full_name text not null,
  monthly_salary numeric(14,2) not null check (monthly_salary >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (branch, full_name)
);

create table public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  branch public.branch_code not null,
  period date not null,
  status public.period_status not null default 'DRAFT',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(branch, period)
);

create table public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.payroll_periods(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  days_in_period numeric(5,2) not null default 30 check (days_in_period between 0 and 31),
  unpaid_leave_days numeric(5,2) not null default 0 check (unpaid_leave_days >= 0),
  sick_days_1_2 numeric(5,2) not null default 0 check (sick_days_1_2 >= 0),
  sick_days_3_plus numeric(5,2) not null default 0 check (sick_days_3_plus >= 0),
  daytime_overtime_hours numeric(6,2) not null default 0 check (daytime_overtime_hours >= 0),
  other_deductions numeric(14,2) not null default 0 check (other_deductions >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(period_id, employee_id)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  branch public.branch_code,
  created_at timestamptz not null default now()
);

create or replace function public.current_user_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.can_access_branch(target_branch public.branch_code)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.current_user_role() = 'MANAGER_MANIZALES'
      or (public.current_user_role() = 'MANAGER_ARMENIA' and target_branch = 'ARMENIA')
$$;

alter table public.profiles enable row level security;
alter table public.employees enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_entries enable row level security;
alter table public.audit_events enable row level security;

create policy "profiles: read own account" on public.profiles for select using (id = auth.uid());
create policy "employees: allowed branch" on public.employees for all using (public.can_access_branch(branch)) with check (public.can_access_branch(branch));
create policy "periods: allowed branch" on public.payroll_periods for all using (public.can_access_branch(branch)) with check (public.can_access_branch(branch));
create policy "entries: allowed branch" on public.payroll_entries for all using (
  exists (select 1 from public.payroll_periods p where p.id = period_id and public.can_access_branch(p.branch))
) with check (
  exists (select 1 from public.payroll_periods p where p.id = period_id and public.can_access_branch(p.branch))
);
create policy "audit: read allowed branch" on public.audit_events for select using (public.can_access_branch(branch));

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.employees, public.payroll_periods, public.payroll_entries to authenticated;
grant select on public.profiles, public.audit_events to authenticated;
