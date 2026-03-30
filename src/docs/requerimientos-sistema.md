# Requerimientos del Sistema

## 1. Propósito

Este documento define una base de requerimientos funcionales, no funcionales y técnicos para el desarrollo de un software de análisis cuantitativo de fracciones proteicas en electroforesis de suero humano.

El objetivo es convertir la descripción del problema en un alcance implementable para un MVP y dejar una base ordenada para fases posteriores de validación, integración y preparación regulatoria.

## 2. Objetivo del Producto

Desarrollar una aplicación para uso en laboratorio clínico que permita:

- importar una imagen electroforética o una curva densitométrica;
- procesar la señal;
- identificar las fracciones Albúmina, Alfa 1, Alfa 2, Beta y Gamma;
- calcular porcentaje relativo y concentración absoluta;
- permitir revisión y corrección manual por usuario autorizado;
- generar reportes trazables y exportables;
- conservar historial, auditoría y control de acceso.

El sistema asistirá al profesional del laboratorio. No realizará diagnóstico clínico autónomo ni reemplazará la validación profesional.




### 3.1 Alcance del MVP

- Gestión básica de usuarios con roles.
- Carga de paciente, muestra y proteínas totales.
- Importación de imágenes estándar y curvas digitales.
- Procesamiento automático de imagen o señal.
- Generación de densitograma.
- Detección y delimitación de fracciones principales.
- Cálculo porcentual y absoluto.
- Visualización gráfica del resultado.
- Corrección manual con trazabilidad.
- Generación de informe HTML/PDF.
- Búsqueda de estudios históricos.
- Registro de auditoría.

## 5. Flujo Operativo Principal

1. El usuario inicia sesión.
2. Registra o selecciona paciente y muestra.
3. Se carga una imagen con la muestra. Esta esta en la seccion CargadeMuestra.tsx. Este componente se encargaria de analizar la imagen y tambien de hacer ajustes si hay que reajustar el cuadro de analisis o area de referencia aplicando valores. Izquierda,arriba,ancho,alto,separacion. Aca hay casos donde hay multiples muestras escaneadas y se tienen que aislar. y despues de eso se prosigue.
-Ahi se va al componente NuevoAnalisisPage.tsx donde se ven los resultados.
4. Ingresa proteínas totales séricas.
5. El sistema ejecuta preprocesamiento y análisis.
6. El sistema muestra densitograma, áreas y resultados cuantitativos.
7. Un usuario autorizado revisa y, si corresponde, ajusta límites o corrige el resultado.
8. El sistema registra toda intervención con fecha, usuario y motivo.
9. El usuario genera el informe final.
10. El estudio queda disponible en historial, búsqueda y auditoría.


### 6.2 Gestión de pacientes y muestras

- RF-04: El sistema deberá permitir alta, edición y consulta de datos del paciente.
- RF-05: El sistema deberá permitir registrar datos de la muestra, fecha, operador y observaciones.
- RF-06: El sistema deberá validar campos obligatorios antes de iniciar el análisis.

### 6.3 Importación de entradas

- RF-07: El sistema deberá importar imágenes de electroforesis en formatos estándar, al menos `PNG`, `JPG/JPEG` y `TIFF`.
- RF-08: El sistema deberá permitir importar curvas densitométricas en formato digital estructurado, al menos `CSV`.
- RF-09: El sistema deberá validar formato, integridad básica y compatibilidad del archivo importado.
- RF-10: El sistema deberá asociar el archivo original al estudio para trazabilidad.

### 6.4 Procesamiento analítico

- RF-11: El sistema deberá convertir una imagen válida en un perfil densitométrico utilizable.
- RF-12: El sistema deberá ejecutar corrección geométrica cuando la entrada sea imagen.
- RF-13: El sistema deberá aplicar corrección de fondo o línea de base.
- RF-14: El sistema deberá aplicar suavizado de señal.
- RF-15: El sistema deberá normalizar la señal para permitir cuantificación consistente.
- RF-16: El sistema deberá detectar máximos y valles relevantes del perfil.
- RF-17: El sistema deberá delimitar automáticamente las áreas de Albúmina, Alfa 1, Alfa 2, Beta y Gamma.
- RF-18: El sistema deberá calcular el porcentaje relativo de cada fracción.
- RF-19: El sistema deberá calcular la concentración absoluta de cada fracción a partir del valor de proteínas totales.
- RF-20: El sistema deberá conservar la versión del algoritmo y parámetros usados en cada análisis.

### 6.5 Visualización y revisión manual

- RF-21: El sistema deberá mostrar el densitograma con identificación visual de picos, valles y áreas.
- RF-22: El sistema deberá mostrar tabla de resultados con porcentaje y concentración por fracción.
- RF-23: El sistema deberá permitir corrección manual de límites por usuario autorizado.
- RF-24: El sistema deberá recalcular automáticamente los resultados luego de una corrección manual.
- RF-25: El sistema deberá requerir motivo o comentario al guardar una corrección manual.
- RF-26: El sistema deberá marcar si un resultado fue automático, corregido o validado.

### 6.6 Reportes e historial

- RF-27: El sistema deberá generar un informe imprimible y exportable en `PDF`.
- RF-28: El informe deberá incluir identificación del paciente, muestra, operador, fecha, densitograma y resultados.
- RF-29: El informe deberá incluir trazabilidad mínima: usuario validador, fecha de validación y versión del análisis.
- RF-30: El sistema deberá almacenar resultados históricos y permitir búsquedas por paciente, fecha, muestra o estado.
- RF-31: El sistema deberá permitir reabrir un estudio histórico para consulta.

### 6.7 Auditoría y trazabilidad

- RF-32: El sistema deberá registrar eventos de creación, modificación, validación y emisión de informe.
- RF-33: El registro de auditoría deberá incluir usuario, fecha/hora, acción y valor previo/nuevo cuando aplique.
- RF-34: El sistema deberá impedir modificación silenciosa de resultados validados.

### 6.8 Control de calidad e integraciones

- RF-35: El sistema deberá emitir alertas técnicas cuando detecte archivos inválidos, señal deficiente o análisis incompleto.
- RF-36: El sistema deberá permitir registrar observaciones técnicas del operador o validador.
- RF-37: El sistema deberá exponer una API para integración futura con LIS/HIS.
- RF-38: El sistema deberá soportar exportación estructurada de resultados para integración futura.

## 7. Requerimientos No Funcionales

- RNF-01: La interfaz deberá ser clara, legible y apta para uso de laboratorio clínico.
- RNF-02: El sistema deberá funcionar correctamente en estaciones Windows 10/11 con navegador moderno.
- RNF-03: El tiempo de procesamiento objetivo para un estudio individual en condiciones normales deberá ser bajo; como referencia inicial, menor a 10 segundos en hardware objetivo.
- RNF-04: El sistema deberá proteger el acceso mediante autenticación y control de permisos.
- RNF-05: El sistema deberá preservar integridad de datos y consistencia transaccional.
- RNF-06: El sistema deberá mantener un registro de auditoría persistente y no editable por usuarios no autorizados.
- RNF-07: El sistema deberá permitir respaldo y restauración de la información.
- RNF-08: El sistema deberá ser escalable a múltiples usuarios y crecimiento de volumen histórico.
- RNF-09: El sistema deberá ser mantenible, testeable y versionable.
- RNF-10: El sistema deberá conservar trazabilidad entre requisitos, implementación, pruebas y versiones del algoritmo.
- RNF-11: El sistema deberá contemplar lineamientos de ciberseguridad aplicables a software con uso en salud.
- RNF-12: El sistema deberá poder documentarse bajo un ciclo de vida compatible con software médico/IVD.

## 8. Requerimientos Técnicos Derivados del Stack

### 8.1 Frontend

- RT-01: La interfaz se implementará como aplicación web local usando `React + TypeScript`.
- RT-02: El frontend deberá consumir una API HTTP interna del backend.
- RT-03: El frontend deberá usar `Tailwind CSS` para construir una UI consistente y mantenible.
- RT-04: La visualización del densitograma y la interacción de revisión deberán soportarse con `Plotly`.

### 8.2 Backend y motor analítico

- RT-05: El backend deberá implementarse con `FastAPI`.
- RT-06: El backend deberá exponer endpoints para autenticación, estudios, resultados, reportes, auditoría e integración futura.
- RT-07: El motor analítico deberá implementarse en Python para compartir lenguaje con el backend.
- RT-08: El procesamiento numérico deberá usar `NumPy` y `SciPy`.
- RT-09: El procesamiento de imágenes deberá usar `OpenCV`.
- RT-10: La generación de reportes deberá realizarse en backend a partir de plantillas `HTML` con exportación a `PDF`.

### 8.3 Persistencia y despliegue

- RT-11: La base de datos relacional deberá ser `PostgreSQL`.
- RT-12: El modelo de datos deberá contemplar pacientes, muestras, estudios, fracciones, usuarios, auditoría y archivos asociados.
- RT-13: El sistema deberá poder desplegarse en contenedores `Docker`.
- RT-14: El despliegue mínimo deberá contemplar al menos aplicación backend, frontend y base de datos.

## 9. Modelo de Datos Inicial

Entidades mínimas propuestas:

- `users`
- `roles`
- `patients`
- `samples`
- `studies`
- `input_files`
- `analysis_runs`
- `fraction_results`
- `reports`
- `audit_events`

Campos clave a contemplar:

- identificadores únicos;
- fechas de creación, actualización y validación;
- usuario creador y usuario validador;
- valor de proteínas totales;
- versión de algoritmo;
- estado del estudio;
- ruta o referencia al archivo fuente;
- resultados porcentuales y absolutos por fracción;
- motivo de corrección manual.

## 10. Requerimientos Analíticos

- RA-01: El algoritmo deberá soportar tanto entradas basadas en imagen como curvas digitales.
- RA-02: El pipeline deberá incluir preprocesamiento, baseline correction, suavizado, normalización, detección de picos y delimitación de áreas.
- RA-03: La integración de áreas deberá implementarse con un método numérico reproducible.
- RA-04: El sistema deberá permitir parametrizar umbrales y criterios analíticos sin cambiar código de negocio.
- RA-05: El sistema deberá conservar evidencia suficiente para repetir el procesamiento sobre una entrada histórica.
- RA-06: El sistema deberá permitir registrar intervención manual y diferenciarla del resultado automático.

## 11. Requerimientos de Validación y Calidad

- RV-01: Se deberá definir un protocolo de verificación y validación del software.
- RV-02: Se deberán implementar pruebas unitarias para el motor analítico y el backend.
- RV-03: Se deberán implementar pruebas de integración para flujo completo de estudio.
- RV-04: Se deberá contar con datasets de prueba normales y patológicos.
- RV-05: Se deberá medir precisión, repetibilidad, reproducibilidad, exactitud, sesgo y concordancia con método comparador.
- RV-06: Se deberá mantener trazabilidad entre requisito, caso de prueba y evidencia.
- RV-07: Se deberá versionar el algoritmo y registrar qué versión produjo cada resultado histórico.

## 12. Criterios de Aceptación del MVP

El MVP se considerará aceptable si cumple, como mínimo, con lo siguiente:

- permite autenticación y roles básicos;
- permite cargar paciente, muestra, proteínas totales y archivo fuente;
- procesa una imagen o curva y genera densitograma;
- identifica las cinco fracciones principales;
- calcula porcentajes y concentraciones absolutas;
- permite corrección manual y deja auditoría;
- genera un informe PDF con datos y gráfico;
- almacena historial consultable;
- funciona en entorno local controlado con despliegue reproducible.

## 13. Decisiones y Supuestos Críticos

- DS-01: Se asume que la primera versión será una aplicación web local y no una aplicación de escritorio nativa.
- DS-02: Se asume que el usuario operará desde navegador en red local o en la misma estación donde corre el sistema.
- DS-03: Se asume que `Docker` es aceptable para el entorno objetivo. Si el laboratorio no puede usar contenedores en producción, habrá que definir otro esquema de instalación.
- DS-04: Se asume que la integración LIS no bloquea el MVP y queda preparada por API/exportación.
- DS-05: Se asume que los comentarios técnicos serán asistidos por reglas simples y no por interpretación clínica automática.

## 14. Riesgos y Puntos Abiertos

- RP-01: Definir formatos exactos de entrada de densitómetros reales.
- RP-02: Definir si el despliegue final será local por PC, servidor on-premise o red interna.
- RP-03: Definir estándar de integración LIS: `CSV`, `REST`, `HL7 v2` u otro.
- RP-04: Definir rangos de referencia, reglas de alerta y textos de informe.
- RP-05: Definir hardware objetivo para fijar métricas de performance realistas.
- RP-06: Definir jurisdicción regulatoria prioritaria para la estrategia documental.

## 15. Recomendación sobre el Stack Propuesto

El stack propuesto es adecuado para este proyecto por estas razones:

- `React + TypeScript + Tailwind` permite una interfaz rápida de construir y segura en tipado para un flujo de laboratorio.
- `FastAPI` encaja bien con servicios internos, tipado, validación y API futura para integración.
- `OpenCV + NumPy + SciPy` es una base sólida para procesamiento de señal e imagen en un dominio científico, incluyendo extracción de perfil, suavizado y segmentación inicial por fracciones.
- `PostgreSQL` resuelve bien persistencia, consultas, historial y auditoría.
- `Plotly` es apropiado para mostrar e incluso revisar interactivamente el densitograma segmentado, con límites y áreas por fracción.
- `HTML + PDF` en backend simplifica reportes estables y trazables.
- `Docker` da reproducibilidad para desarrollo, prueba y despliegue controlado.

La única salvedad importante es el despliegue final en laboratorios Windows. Si la operación real no acepta contenedores o requiere instalación sin dependencia de Docker, eso debe definirse ahora porque impacta la arquitectura operativa.


# Informacion importante.
Se creo en supabase el registro de los pacientes y sus analisis.

prosoft_project.analisis_electroforesis (
  id uuid not null default gen_random_uuid (),
  paciente_id uuid not null,
  numero_placa text null,
  numero_muestra text null,
  numero_paciente text null,
  cantidad_picos integer null,
  concentracion_total numeric(10, 2) null,
  albumina_porcentaje numeric(6, 2) null,
  albumina_concentracion numeric(10, 2) null,
  alfa_1_porcentaje numeric(6, 2) null,
  alfa_1_concentracion numeric(10, 2) null,
  alfa_2_porcentaje numeric(6, 2) null,
  alfa_2_concentracion numeric(10, 2) null,
  beta_1_porcentaje numeric(6, 2) null,
  beta_1_concentracion numeric(10, 2) null,
  beta_2_porcentaje numeric(6, 2) null,
  beta_2_concentracion numeric(10, 2) null,
  gamma_porcentaje numeric(6, 2) null,
  gamma_concentracion numeric(10, 2) null,
  observaciones_generales text null,
  fecha_hora_analisis timestamp with time zone not null default now(),
  estado text not null default 'pendiente'::text,
  equipo_origen text null,
  modelo_equipo text null,
  lote_reactivo text null,
  numero_corrida text null,
  tipo_muestra text null,
  archivo_densitograma_url text null,
  archivo_reporte_url text null,
  resultado_crudo jsonb null,
  created_by uuid null,
  validated_by uuid null,
  fecha_validacion timestamp with time zone null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint analisis_electroforesis_pkey primary key (id),
  constraint analisis_electroforesis_created_by_fkey foreign KEY (created_by) references auth.users (id),
  constraint analisis_electroforesis_paciente_id_fkey foreign KEY (paciente_id) references prosoft_project.pacientes (id) on delete CASCADE,
  constraint analisis_electroforesis_validated_by_fkey foreign KEY (validated_by) references auth.users (id),
  constraint analisis_electroforesis_estado_check check (
    (
      estado = any (
        array[
          'pendiente'::text,
          'procesado'::text,
          'validado'::text,
          'observado'::text,
          'anulado'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists analisis_electroforesis_paciente_id_idx on prosoft_project.analisis_electroforesis using btree (paciente_id) TABLESPACE pg_default;

create index IF not exists analisis_electroforesis_estado_idx on prosoft_project.analisis_electroforesis using btree (estado) TABLESPACE pg_default;

create index IF not exists analisis_electroforesis_fecha_hora_analisis_idx on prosoft_project.analisis_electroforesis using btree (fecha_hora_analisis desc) TABLESPACE pg_default;

create trigger trg_analisis_updated_at BEFORE
update on prosoft_project.analisis_electroforesis for EACH row
execute FUNCTION prosoft_project.set_updated_at ();


prosoft_project.analisis_imagenes (
  id uuid not null default gen_random_uuid (),
  analisis_id uuid not null,
  tipo text null,
  url text not null,
  nombre_archivo text null,
  created_at timestamp with time zone not null default now(),
  constraint analisis_imagenes_pkey primary key (id),
  constraint analisis_imagenes_analisis_id_fkey foreign KEY (analisis_id) references prosoft_project.analisis_electroforesis (id) on delete CASCADE,
  constraint analisis_imagenes_tipo_check check (
    (
      tipo = any (
        array[
          'densitograma'::text,
          'reporte'::text,
          'otro'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists analisis_imagenes_analisis_id_idx on prosoft_project.analisis_imagenes using btree (analisis_id) TABLESPACE pg_default;

prosoft_project.pacientes (
  id uuid not null default gen_random_uuid (),
  paciente_codigo text null,
  dni text null,
  nombre text not null,
  apellido text not null,
  fecha_nacimiento date null,
  sexo text null,
  historia_clinica text null,
  telefono text null,
  email text null,
  obra_social text null,
  observaciones text null,
  activo boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint pacientes_pkey primary key (id),
  constraint pacientes_dni_key unique (dni),
  constraint pacientes_paciente_codigo_key unique (paciente_codigo),
  constraint pacientes_sexo_check check (
    (
      sexo = any (
        array['masculino'::text, 'femenino'::text, 'otro'::text]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists pacientes_dni_idx on prosoft_project.pacientes using btree (dni) TABLESPACE pg_default;

create index IF not exists pacientes_apellido_nombre_idx on prosoft_project.pacientes using btree (apellido, nombre) TABLESPACE pg_default;

create trigger trg_paciente_codigo BEFORE INSERT on prosoft_project.pacientes for EACH row
execute FUNCTION prosoft_project.set_paciente_codigo ();

create trigger trg_pacientes_updated_at BEFORE
update on prosoft_project.pacientes for EACH row
execute FUNCTION prosoft_project.set_updated_at ();