-- EM-IT kundportal: databas och åtkomstregler
-- Körs en gång i Supabase (SQL Editor) på ett nytt, tomt projekt.

-- ---------- Typer
create type public.app_role as enum ('admin', 'customer');
create type public.ticket_category as enum ('hemsida', 'it');
create type public.ticket_status as enum ('mottaget', 'pagar', 'klart');
create type public.service_kind as enum ('hemsida', 'doman', 'ssl', 'backup', 'annat');
create type public.service_status as enum ('ok', 'varning', 'nere');

-- ---------- Tabeller
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  org_number text,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  company_id uuid references public.companies (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Roller ligger i en egen tabell så att ingen kan ge sig själv en roll via sin profil.
create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  primary key (user_id, role)
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  category public.ticket_category not null,
  title text not null check (char_length(title) between 1 and 200),
  description text check (description is null or char_length(description) <= 4000),
  status public.ticket_status not null default 'mottaget',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind public.service_kind not null,
  label text not null check (char_length(label) between 1 and 200),
  status public.service_status not null default 'ok',
  detail text,
  renews_on date,
  updated_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  number text not null,
  issued_on date not null,
  description text,
  amount_ex_vat numeric(10, 2) not null,
  paid boolean not null default false,
  pdf_path text,
  created_at timestamptz not null default now()
);

-- Förfrågningar från kontaktformuläret på startsidan.
create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  company text check (company is null or char_length(company) <= 200),
  contact text not null check (char_length(contact) between 3 and 200),
  topic text check (topic is null or char_length(topic) <= 100),
  message text check (message is null or char_length(message) <= 4000),
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

create index on public.profiles (company_id);
create index on public.tickets (company_id, created_at desc);
create index on public.services (company_id);
create index on public.invoices (company_id, issued_on desc);

-- ---------- Hjälpfunktioner (security definer, så att reglerna inte läser tabellen de skyddar)
create or replace function public.has_role(_user uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user and role = _role);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'admin');
$$;

create or replace function public.current_company_id()
returns uuid language sql stable security definer set search_path = public as $$
  select company_id from public.profiles where id = auth.uid();
$$;

-- Ny användare får automatiskt en profil (utan företag tills en admin kopplar den).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tickets_touch before update on public.tickets
  for each row execute function public.touch_updated_at();
create trigger services_touch before update on public.services
  for each row execute function public.touch_updated_at();

-- ---------- Rättigheter på tabellnivå (reglerna nedan avgör vilka rader)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.companies, public.profiles, public.user_roles, public.tickets,
  public.services, public.invoices, public.contact_requests
  to authenticated;
grant insert on public.contact_requests to anon;

-- ---------- Radnivåsäkerhet
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.tickets enable row level security;
alter table public.services enable row level security;
alter table public.invoices enable row level security;
alter table public.contact_requests enable row level security;

-- Företag: kunden ser sitt eget, admin allt.
create policy companies_select on public.companies for select to authenticated
  using (public.is_admin() or id = public.current_company_id());
create policy companies_admin on public.companies for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Profiler: man ser sin egen. Bara admin får ändra (annars kunde en kund byta företag).
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_admin() or id = auth.uid());
create policy profiles_admin on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Roller: man ser sina egna, bara admin ändrar.
create policy roles_select on public.user_roles for select to authenticated
  using (public.is_admin() or user_id = auth.uid());
create policy roles_admin on public.user_roles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Ärenden: kunden ser och skapar för sitt eget företag, alltid med status "mottaget".
create policy tickets_select on public.tickets for select to authenticated
  using (public.is_admin() or company_id = public.current_company_id());
create policy tickets_insert on public.tickets for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and created_by = auth.uid()
    and status = 'mottaget'
  );
create policy tickets_admin on public.tickets for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Tjänster och fakturor: kunden läser sitt eget, admin sköter allt.
create policy services_select on public.services for select to authenticated
  using (public.is_admin() or company_id = public.current_company_id());
create policy services_admin on public.services for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy invoices_select on public.invoices for select to authenticated
  using (public.is_admin() or company_id = public.current_company_id());
create policy invoices_admin on public.invoices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Kontaktformuläret: vem som helst får skicka in, bara admin får läsa.
create policy contact_insert on public.contact_requests for insert to anon, authenticated
  with check (handled = false);
create policy contact_admin_select on public.contact_requests for select to authenticated
  using (public.is_admin());
create policy contact_admin_update on public.contact_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy contact_admin_delete on public.contact_requests for delete to authenticated
  using (public.is_admin());

-- ---------- Fakturor som PDF: privat lagring, en mapp per företag
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

create policy invoices_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'invoices'
    and (public.is_admin() or (storage.foldername(name))[1] = public.current_company_id()::text)
  );
create policy invoices_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'invoices' and public.is_admin());
create policy invoices_files_update on storage.objects for update to authenticated
  using (bucket_id = 'invoices' and public.is_admin())
  with check (bucket_id = 'invoices' and public.is_admin());
create policy invoices_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'invoices' and public.is_admin());
