-- VSN Imóveis: lead status and in-panel notification tracking.
-- Existing leads are marked as already read so only future submissions trigger alerts.
alter table public.leads
  add column if not exists status text not null default 'new',
  add column if not exists read_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.leads'::regclass
      and conname = 'leads_status_check'
  ) then
    alter table public.leads
      add constraint leads_status_check
      check (status in ('new','contacted','qualified','inactive','converted'));
  end if;
end $$;

update public.leads
set read_at = created_at
where read_at is null;

alter table public.leads enable row level security;

drop policy if exists "authenticated can update leads" on public.leads;
create policy "authenticated can update leads"
  on public.leads for update to authenticated
  using (true) with check (true);

grant select, update on public.leads to authenticated;
