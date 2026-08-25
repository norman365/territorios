-- Campañas de territorios
-- Ejecutar en Supabase → SQL Editor

create table if not exists campanas (
  id bigint generated always as identity primary key,
  nombre text not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint campanas_fechas_ok check (fecha_fin >= fecha_inicio)
);

create table if not exists campana_territorios (
  id bigint generated always as identity primary key,
  campana_id bigint not null references campanas(id) on delete cascade,
  numero_territorio integer not null check (numero_territorio between 1 and 110),
  unique (campana_id, numero_territorio)
);

create index if not exists campana_territorios_campana_idx
  on campana_territorios (campana_id);

create index if not exists campanas_fechas_idx
  on campanas (fecha_inicio, fecha_fin);

alter table campanas enable row level security;
alter table campana_territorios enable row level security;

drop policy if exists "campanas_all" on campanas;
create policy "campanas_all"
  on campanas for all
  using (true) with check (true);

drop policy if exists "campana_territorios_all" on campana_territorios;
create policy "campana_territorios_all"
  on campana_territorios for all
  using (true) with check (true);
