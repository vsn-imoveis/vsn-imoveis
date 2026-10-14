-- Versus CRM SaaS foundation
-- Applied to Supabase project jpdfynaioepcmgqlqlht on 2026-10-14.
create table if not exists public.crm_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text not null unique, legal_name text, cnpj text,
  contact_name text, contact_email text, contact_phone text, logo_url text,
  primary_color text not null default '#7c9cff',
  status text not null default 'pending' check (status in ('pending','active','suspended','cancelled')),
  max_properties integer not null default 100 check (max_properties > 0),
  max_photos_per_property integer not null default 35 check (max_photos_per_property > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.crm_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.crm_companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','agent','viewer')),
  created_at timestamptz not null default now(), unique (company_id, user_id)
);
create table if not exists public.crm_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.crm_companies(id) on delete cascade,
  plan_code text not null default 'essencial', plan_name text not null default 'Essencial',
  monthly_price numeric(10,2) not null default 100.00 check (monthly_price >= 0),
  property_limit integer not null default 100 check (property_limit > 0),
  photo_limit integer not null default 35 check (photo_limit > 0),
  status text not null default 'trial' check (status in ('trial','active','past_due','cancelled','suspended')),
  billing_provider text, provider_customer_id text, provider_subscription_id text,
  current_period_start timestamptz, current_period_end timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (company_id)
);
create table if not exists public.crm_domains (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.crm_companies(id) on delete cascade,
  hostname text not null unique,
  domain_type text not null default 'subdomain' check (domain_type in ('subdomain','custom')),
  is_primary boolean not null default false,
  status text not null default 'pending' check (status in ('pending','verified','active','error')),
  verification_token text, created_at timestamptz not null default now()
);
create index if not exists crm_memberships_user_id_idx on public.crm_memberships(user_id);
create index if not exists crm_subscriptions_status_idx on public.crm_subscriptions(status);
create index if not exists crm_domains_company_id_idx on public.crm_domains(company_id);
alter table public.crm_companies enable row level security;
alter table public.crm_memberships enable row level security;
alter table public.crm_subscriptions enable row level security;
alter table public.crm_domains enable row level security;
drop policy if exists crm_companies_platform_admin_all on public.crm_companies;
create policy crm_companies_platform_admin_all on public.crm_companies for all to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'::public.app_role))
with check (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'::public.app_role));
drop policy if exists crm_companies_member_read on public.crm_companies;
create policy crm_companies_member_read on public.crm_companies for select to authenticated
using (exists (select 1 from public.crm_memberships m where m.company_id=crm_companies.id and m.user_id=(select auth.uid())));
drop policy if exists crm_memberships_platform_admin_all on public.crm_memberships;
create policy crm_memberships_platform_admin_all on public.crm_memberships for all to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'::public.app_role))
with check (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'::public.app_role));
drop policy if exists crm_memberships_self_read on public.crm_memberships;
create policy crm_memberships_self_read on public.crm_memberships for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists crm_subscriptions_platform_admin_all on public.crm_subscriptions;
create policy crm_subscriptions_platform_admin_all on public.crm_subscriptions for all to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'::public.app_role))
with check (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'::public.app_role));
drop policy if exists crm_subscriptions_member_read on public.crm_subscriptions;
create policy crm_subscriptions_member_read on public.crm_subscriptions for select to authenticated
using (exists (select 1 from public.crm_memberships m where m.company_id=crm_subscriptions.company_id and m.user_id=(select auth.uid())));
drop policy if exists crm_domains_platform_admin_all on public.crm_domains;
create policy crm_domains_platform_admin_all on public.crm_domains for all to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'::public.app_role))
with check (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'::public.app_role));
drop policy if exists crm_domains_member_read on public.crm_domains;
create policy crm_domains_member_read on public.crm_domains for select to authenticated
using (exists (select 1 from public.crm_memberships m where m.company_id=crm_domains.company_id and m.user_id=(select auth.uid())));
grant select, insert, update, delete on public.crm_companies, public.crm_memberships, public.crm_subscriptions, public.crm_domains to authenticated;

-- Seed the first customer. Existing VSN properties are intentionally not assigned
-- to this tenant yet; that migration requires an audited property ownership mapping.
insert into public.crm_companies (name, slug, contact_name, status, max_properties, max_photos_per_property, primary_color)
values ('VSN Imóveis', 'vsn-imoveis', 'Vinicius Silva Nascimento', 'active', 100, 35, '#d3aa62')
on conflict (slug) do nothing;

insert into public.crm_subscriptions (company_id, plan_code, plan_name, monthly_price, property_limit, photo_limit, status)
select id, 'essencial', 'Essencial', 100.00, 100, 35, 'trial'
from public.crm_companies where slug = 'vsn-imoveis'
on conflict (company_id) do nothing;
