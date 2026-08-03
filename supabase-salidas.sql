-- Programa semanal de salidas al ministerio
-- Ejecutar en Supabase → SQL Editor

create table if not exists salidas_programa (
  id bigint generated always as identity primary key,
  domingo date not null unique,
  recordatorio_desde date,
  recordatorio_hasta date,
  recordatorio_grupo integer check (recordatorio_grupo between 1 and 5),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists salidas_item (
  id bigint generated always as identity primary key,
  programa_id bigint not null references salidas_programa(id) on delete cascade,
  dia smallint not null check (dia between 0 and 6),
  horario text not null,
  conductor text not null default '',
  punto_encuentro text not null default '',
  grupos integer[] not null default '{}',
  territorios integer[] not null default '{}',
  manzanas text[] not null default '{}',
  creado_en timestamptz not null default now()
);

create index if not exists salidas_item_programa_idx
  on salidas_item (programa_id, dia, horario);

alter table salidas_programa enable row level security;
alter table salidas_item enable row level security;

-- Políticas abiertas (mismo enfoque que el resto de la app actual)
drop policy if exists "salidas_programa_all" on salidas_programa;
create policy "salidas_programa_all"
  on salidas_programa for all
  using (true) with check (true);

drop policy if exists "salidas_item_all" on salidas_item;
create policy "salidas_item_all"
  on salidas_item for all
  using (true) with check (true);
