# Supabase — Migraciones

Ejecutar cada paso en orden en el **SQL Editor** de Supabase.

---

## Paso 0 — Crear schema

```sql
create schema if not exists prosoft_project;
```

---

## Paso 1 — Tabla `pacientes`

```sql
create table prosoft_project.pacientes (
  id                uuid primary key default gen_random_uuid(),
  paciente_codigo   text unique,
  dni               text unique,
  nombre            text not null,
  apellido          text not null,
  fecha_nacimiento  date,
  sexo              text check (sexo in ('masculino', 'femenino', 'otro')),
  historia_clinica  text,
  telefono          text,
  email             text,
  obra_social       text,
  observaciones     text,
  activo            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
```

---

## Paso 2 — Tabla `analisis_electroforesis`

```sql
create table prosoft_project.analisis_electroforesis (
  id                        uuid primary key default gen_random_uuid(),
  paciente_id               uuid not null references prosoft_project.pacientes(id) on delete cascade,

  numero_placa              text,
  numero_muestra            text,
  numero_paciente           text,

  cantidad_picos            integer,
  concentracion_total       numeric(10,2),

  albumina_porcentaje       numeric(6,2),
  albumina_concentracion    numeric(10,2),

  alfa_1_porcentaje         numeric(6,2),
  alfa_1_concentracion      numeric(10,2),

  alfa_2_porcentaje         numeric(6,2),
  alfa_2_concentracion      numeric(10,2),

  beta_1_porcentaje         numeric(6,2),
  beta_1_concentracion      numeric(10,2),

  beta_2_porcentaje         numeric(6,2),
  beta_2_concentracion      numeric(10,2),

  gamma_porcentaje          numeric(6,2),
  gamma_concentracion       numeric(10,2),

  observaciones_generales   text,
  fecha_hora_analisis       timestamptz not null default now(),

  estado                    text not null default 'pendiente'
    check (estado in ('pendiente', 'procesado', 'validado', 'observado', 'anulado')),

  equipo_origen             text,
  modelo_equipo             text,
  lote_reactivo             text,
  numero_corrida            text,
  tipo_muestra              text,

  archivo_densitograma_url  text,
  archivo_reporte_url       text,
  resultado_crudo           jsonb,

  created_by                uuid references auth.users(id),
  validated_by              uuid references auth.users(id),
  fecha_validacion          timestamptz,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
```

---

## Paso 3 — Tabla `analisis_imagenes`

```sql
create table prosoft_project.analisis_imagenes (
  id              uuid primary key default gen_random_uuid(),
  analisis_id     uuid not null references prosoft_project.analisis_electroforesis(id) on delete cascade,
  tipo            text check (tipo in ('densitograma', 'reporte', 'otro')),
  url             text not null,
  nombre_archivo  text,
  created_at      timestamptz not null default now()
);
```

---

## Paso 4 — Función y triggers `updated_at`

```sql
create or replace function prosoft_project.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_pacientes_updated_at
  before update on prosoft_project.pacientes
  for each row execute function prosoft_project.set_updated_at();

create trigger trg_analisis_updated_at
  before update on prosoft_project.analisis_electroforesis
  for each row execute function prosoft_project.set_updated_at();
```

---

## Paso 5 — Auto-generación de `paciente_codigo`

```sql
create sequence prosoft_project.paciente_codigo_seq start 1000;

create or replace function prosoft_project.set_paciente_codigo()
returns trigger language plpgsql as $$
begin
  if new.paciente_codigo is null then
    new.paciente_codigo := 'PAC-' || lpad(nextval('prosoft_project.paciente_codigo_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger trg_paciente_codigo
  before insert on prosoft_project.pacientes
  for each row execute function prosoft_project.set_paciente_codigo();
```

> Cada paciente nuevo recibe un código del tipo `PAC-001000`, `PAC-001001`, etc.

---

## Paso 6 — Índices de performance

```sql
create index on prosoft_project.pacientes (dni);
create index on prosoft_project.pacientes (apellido, nombre);
create index on prosoft_project.analisis_electroforesis (paciente_id);
create index on prosoft_project.analisis_electroforesis (estado);
create index on prosoft_project.analisis_electroforesis (fecha_hora_analisis desc);
create index on prosoft_project.analisis_imagenes (analisis_id);
```

---

## Paso 7 — Row Level Security (RLS)

### Tabla `pacientes`
```sql
alter table prosoft_project.pacientes enable row level security;

create policy "Autenticado lee pacientes"
  on prosoft_project.pacientes for select
  to authenticated using (true);

create policy "Autenticado inserta pacientes"
  on prosoft_project.pacientes for insert
  to authenticated with check (true);

create policy "Autenticado actualiza pacientes"
  on prosoft_project.pacientes for update
  to authenticated using (true);
```

### Tabla `analisis_electroforesis`
```sql
alter table prosoft_project.analisis_electroforesis enable row level security;

create policy "Autenticado lee analisis"
  on prosoft_project.analisis_electroforesis for select
  to authenticated using (true);

create policy "Autenticado inserta analisis"
  on prosoft_project.analisis_electroforesis for insert
  to authenticated with check (true);

create policy "Autenticado actualiza analisis"
  on prosoft_project.analisis_electroforesis for update
  to authenticated using (true);
```

### Tabla `analisis_imagenes`
```sql
alter table prosoft_project.analisis_imagenes enable row level security;

create policy "Autenticado lee imagenes"
  on prosoft_project.analisis_imagenes for select
  to authenticated using (true);

create policy "Autenticado inserta imagenes"
  on prosoft_project.analisis_imagenes for insert
  to authenticated with check (true);
```

---

## Paso 8 — Storage bucket para imágenes

En el dashboard de Supabase ir a **Storage → New bucket**:

| Campo     | Valor                     |
|-----------|---------------------------|
| Name      | `electroforesis-imagenes` |
| Public    | No (privado)              |
| File size | 50 MB (recomendado)       |

Luego agregar las policies en **Storage → electroforesis-imagenes → Policies**:

```sql
create policy "Autenticado lee archivos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'electroforesis-imagenes');

create policy "Autenticado sube archivos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'electroforesis-imagenes');

create policy "Autenticado elimina archivos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'electroforesis-imagenes');
```

---

## Checklist de aplicación

- [ ] Paso 0 — Crear schema `prosoft_project`
- [ ] Paso 1 — Tabla `pacientes`
- [ ] Paso 2 — Tabla `analisis_electroforesis`
- [ ] Paso 3 — Tabla `analisis_imagenes`
- [ ] Paso 4 — Triggers `updated_at`
- [ ] Paso 5 — Secuencia y trigger `paciente_codigo`
- [ ] Paso 6 — Índices
- [ ] Paso 7 — RLS en las 3 tablas
- [ ] Paso 8 — Bucket `electroforesis-imagenes` + policies de storage
