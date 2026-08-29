-- ============================================================
-- Setup del tablero colaborativo en Supabase
-- Ejecutar este script en: Supabase Dashboard -> SQL Editor -> New query
-- ============================================================

-- 1) Crear la tabla de labels (mensajes del tablero)
create table if not exists public.labels (
    client_id   text        not null,
    day_start   bigint      not null,
    text        text        not null,
    x           double precision not null,
    y           double precision not null,
    color       text        not null,
    name        text,
    timestamp   bigint      not null,
    constraint labels_pkey primary key (client_id, day_start)
);

-- 2) Índice para ordenar por fecha
create index if not exists labels_timestamp_idx on public.labels (timestamp);

-- 3) Habilitar Row Level Security y permitir acceso desde el backend
alter table public.labels enable row level security;

-- Permite a tu server.js (con la key service_role) leer/insertar/actualizar/borrar todo
create policy "Backend full access"
    on public.labels
    for all
    to service_role
    using (true)
    with check (true);

-- Permite lectura pública (opcional, para que una app cliente pueda leer sin backend)
create policy "Public read"
    on public.labels
    for select
    to anon
    using (true);
