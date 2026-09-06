-- Color de fuente por fila del programa de salidas
-- Ejecutar en Supabase → SQL Editor

alter table salidas_item
  add column if not exists color_fuente text not null default '#000000';
