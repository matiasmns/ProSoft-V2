# Reference Calibration en Supabase

## 1. Crear la vista

Abrir el **SQL Editor** de Supabase y ejecutar el contenido de:

- [reference-calibration-view.sql](/e:/GitHub/ProSoft_V2/ProSoft%20V2/src/docs/reference-calibration-view.sql)

Esa vista expone, en forma tabular, la calibracion PDF guardada dentro de `resultado_crudo.reference_calibration`.

## 2. Verificar datos

```sql
select
  analisis_id,
  numero_muestra,
  apellido,
  nombre,
  reference_updated_at,
  targets
from prosoft_project.reference_calibration
order by reference_updated_at desc;
```

## 3. Acceso desde el frontend

La app agrega la ruta:

- `/calibracion-referencias`

Y una entrada de navegacion:

- `Reference Calibration`

## 4. Requisito operativo

Para que aparezcan filas en la vista, primero hay que:

1. procesar una muestra;
2. usar `Calibracion con PDF`;
3. guardar el analisis.

Sin eso, `resultado_crudo.reference_calibration` no existe y la vista no devuelve registros.
