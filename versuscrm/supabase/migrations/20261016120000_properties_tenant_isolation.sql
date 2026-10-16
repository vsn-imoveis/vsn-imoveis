-- VersusCRM: propriedade sempre pertence a uma imobiliária.
-- Aplicar SOMENTE no Supabase dedicado Blue Dog (xmwkakimyifmspzoziji).
-- Não executar no projeto legado da VSN.
--
-- Pré-condição: public.crm_companies e public.crm_memberships já existem.
-- Este arquivo não migra nem atribui imóveis antigos da VSN.

begin;

alter table public.properties
  add column if not exists company_id uuid
  references public.crm_companies(id) on delete cascade;

create index if not exists properties_company_id_idx
  on public.properties(company_id);

alter table public.properties enable row level security;

drop policy if exists properties_member_select_own_company on public.properties;
create policy properties_member_select_own_company
on public.properties
for select
to authenticated
using (
  company_id is not null
  and exists (
    select 1
    from public.crm_memberships m
    where m.company_id = properties.company_id
      and m.user_id = (select auth.uid())
  )
);

drop policy if exists properties_member_insert_own_company on public.properties;
create policy properties_member_insert_own_company
on public.properties
for insert
to authenticated
with check (
  company_id is not null
  and exists (
    select 1
    from public.crm_memberships m
    where m.company_id = properties.company_id
      and m.user_id = (select auth.uid())
  )
);

drop policy if exists properties_member_update_own_company on public.properties;
create policy properties_member_update_own_company
on public.properties
for update
to authenticated
using (
  company_id is not null
  and exists (
    select 1
    from public.crm_memberships m
    where m.company_id = properties.company_id
      and m.user_id = (select auth.uid())
  )
)
with check (
  company_id is not null
  and exists (
    select 1
    from public.crm_memberships m
    where m.company_id = properties.company_id
      and m.user_id = (select auth.uid())
  )
);

drop policy if exists properties_member_delete_own_company on public.properties;
create policy properties_member_delete_own_company
on public.properties
for delete
to authenticated
using (
  company_id is not null
  and exists (
    select 1
    from public.crm_memberships m
    where m.company_id = properties.company_id
      and m.user_id = (select auth.uid())
  )
);

commit;
