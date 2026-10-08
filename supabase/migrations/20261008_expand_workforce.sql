-- Run once in Supabase SQL Editor after schema.sql.
-- Classifies every person shown in the Manizales workbook without mixing them into payroll.
create type public.workforce_category as enum ('LABORAL', 'HONORARIOS', 'APOYO_OTRA_SEDE');
create type public.payment_mode as enum ('MENSUAL', 'PROCEDIMIENTO', 'HORA', 'REFERENCIA');

alter table public.employees
  add column category public.workforce_category not null default 'LABORAL',
  add column payment_mode public.payment_mode not null default 'MENSUAL',
  add column role_title text,
  add column transport_allowance numeric(14,2) not null default 0,
  add column notes text;

create index employees_branch_category_idx on public.employees (branch, category);
