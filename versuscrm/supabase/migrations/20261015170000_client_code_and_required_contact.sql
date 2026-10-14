-- Versus CRM: sequencial do cliente, nomes de site únicos e contatos obrigatórios.
-- O código do cliente é separado do slug do site, que continua sendo o endereço/identificador textual.
create sequence if not exists public.crm_company_client_code_seq;

alter table public.crm_companies
  add column if not exists client_code bigint;

-- Preserva códigos numéricos já usados como slug (ex.: 0000001).
update public.crm_companies
set client_code = trim(leading '0' from slug)::bigint
where client_code is null
  and slug ~ '^[0-9]{1,18}$'
  and trim(leading '0' from slug) <> ''
  and not exists (
    select 1 from public.crm_companies other
    where other.client_code = trim(leading '0' from crm_companies.slug)::bigint
  );

-- Atribui códigos aos demais registros sem alterar o slug existente.
with missing as (
  select id, row_number() over (order by created_at, id) as rn
  from public.crm_companies
  where client_code is null
), base as (
  select coalesce(max(client_code), 0) as max_code from public.crm_companies
)
update public.crm_companies c
set client_code = base.max_code + missing.rn
from missing cross join base
where c.id = missing.id;

select setval(
  'public.crm_company_client_code_seq',
  greatest(coalesce((select max(client_code) from public.crm_companies), 0) + 1, 1),
  false
);

alter table public.crm_companies
  alter column client_code set default nextval('public.crm_company_client_code_seq'),
  alter column client_code set not null;

create unique index if not exists crm_companies_client_code_uidx
  on public.crm_companies(client_code);

-- Evita duplicidade de nome mesmo com diferenças de caixa ou espaços.
create unique index if not exists crm_companies_name_ci_uidx
  on public.crm_companies (lower(trim(name)));

alter table public.crm_companies
  alter column contact_name set not null,
  alter column contact_email set not null,
  alter column contact_phone set not null;

alter table public.crm_companies
  drop constraint if exists crm_companies_contact_name_nonblank,
  add constraint crm_companies_contact_name_nonblank check (length(trim(contact_name)) > 0),
  drop constraint if exists crm_companies_contact_email_nonblank,
  add constraint crm_companies_contact_email_nonblank check (length(trim(contact_email)) > 0),
  drop constraint if exists crm_companies_contact_phone_nonblank,
  add constraint crm_companies_contact_phone_nonblank check (length(trim(contact_phone)) > 0),
  drop constraint if exists crm_companies_name_nonblank,
  add constraint crm_companies_name_nonblank check (length(trim(name)) > 0);
