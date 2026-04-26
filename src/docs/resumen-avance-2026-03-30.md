# Resumen de Avance

Fecha: 2026-03-30

## Objetivo del trabajo

Adaptar el flujo de un requerimiento previo de electroforesis a este sistema mas simplificado, manteniendo:

- carga de paciente
- carga de muestra e imagen
- recorte inicial de la imagen
- procesamiento del densitograma
- obtencion de fracciones
- persistencia en Supabase
- posibilidad de revision manual antes del guardado final

## Flujo actual implementado

1. Paciente
   - Alta y gestion desde frontend.
   - Persistencia en Supabase.

2. Carga de muestra
   - Pantalla: `src/pages/CargadeMuestra.tsx`
   - Permite subir imagenes del estudio.
   - Permite seleccionar tipo de imagen.
   - Incluye editor visual de recorte con `react-image-crop`.
   - Guarda `izquierda`, `arriba`, `ancho` y `alto`.
   - Muestra vista previa del recorte y analisis de margenes/cobertura.

3. Creacion del analisis
   - Se crea un `analisis_electroforesis` en estado `pendiente`.
   - Se suben las imagenes a Supabase Storage.
   - Se registran entradas en `analisis_imagenes`.
   - Se guarda metadata inicial en `resultado_crudo`.

4. Procesamiento
   - Pantalla: `src/pages/NuevoAnalisisPage.tsx`
   - Tiene dos modos:
     - `Automatico`: usa backend FastAPI si `VITE_ANALYSIS_API_URL` esta definido y disponible.
     - `Solo local`: evita intento al backend y usa procesador frontend.
   - Si el backend no esta configurado, el frontend queda en modo local sin intentar `127.0.0.1:8000`.

5. Revision manual
   - El densitograma ahora tiene revision interactiva.
   - Hay 7 lineas coloreadas de delimitacion.
   - Las lineas internas se pueden mover.
   - Las lineas extremas `Inicio` y `Fin` quedaron fijas.
   - La tabla de fracciones se recalcula en tiempo real.
   - La revision se guarda en `resultado_crudo.manual_review` al guardar el analisis.

## Componentes y archivos clave

- `src/pages/IngresoPacientePage.tsx`
  - Alta de paciente.

- `src/pages/CargadeMuestra.tsx`
  - Carga de imagenes.
  - Editor de recorte.
  - Analisis visual del area seleccionada.

- `src/pages/NuevoAnalisisPage.tsx`
  - Procesamiento del estudio.
  - Selector de motor.
  - Densitograma interactivo.
  - Revision manual de minimos/separadores.

- `src/lib/electroforesis.ts`
  - Helpers de storage, firmas de URL y armado de `resultado_crudo`.

- `src/lib/localProcessor.ts`
  - Procesador frontend preliminar.
  - Extrae perfil 1D y calcula fracciones base.

- `src/lib/manualProfileReview.ts`
  - Recalculo de fracciones segun separadores manuales.
  - Snap al minimo local.
  - Normalizacion de separadores.

- `src/lib/backendProcessor.ts`
  - Cliente HTTP al backend.
  - Backend queda habilitado solo si existe `VITE_ANALYSIS_API_URL`.

- `backend/app/main.py`
  - API FastAPI.

- `backend/app/processor.py`
  - Procesador Python con OpenCV + NumPy + SciPy.

- `backend/app/default_calibration.json`
  - Parametros base de calibracion.

- `backend/app/synthetic_cases.py`
- `backend/scripts/run_synthetic_calibration.py`
- `backend/tests/test_processor.py`
  - Base de calibracion y testeo sintetico del backend.

## Estado del procesamiento

### Frontend

- Existe fallback local funcional.
- Sirve para pruebas y para no bloquear el flujo.
- No debe considerarse motor analitico validado.

### Backend

- Existe scaffold FastAPI operativo.
- Usa Python con:
  - FastAPI
  - OpenCV
  - NumPy
  - SciPy
- Tiene calibracion base sintetica.
- Falta calibracion con estudios reales del equipo.

## Mejoras ya realizadas en la revision del densitograma

- Subgrilla visual.
- Areas sombreadas bajo la curva por fraccion.
- Escala vertical de intensidad normalizada.
- Escala horizontal de recorrido del densitograma.
- Seleccion de minimo desde caja de herramientas.
- Ajuste fino con slider y nudges.
- Bloqueo de lineas extremas.

## Supabase

Se esta usando para:

- pacientes
- estudios/analisis
- imagenes asociadas
- storage de archivos
- autenticacion

Notas:

- El perfil de usuario se lee desde `profile`.
- Se corrigio el `406` del `TopBar/HomePage` usando `maybeSingle()`.
- Si no existe fila en `profile`, se usa fallback con el email del usuario.

## Variables de entorno relevantes

Frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ANALYSIS_API_URL` opcional

Backend:

- entorno Python en `backend/.venv`

## Comandos utiles

Frontend:

```powershell
npm install
npm run dev
```

Backend:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Chequeos usados durante el avance:

```powershell
npx.cmd tsc -b
python -m unittest discover -s backend/tests
```

## Pendientes importantes

1. Calibrar el backend con estudios reales validados por laboratorio.
2. Definir rangos de referencia clinicos por fraccion y mostrarlos en UI.
3. Resolver PDF/reportes finales.
4. Completar auditoria y trazabilidad formal.
5. Evaluar si el densitograma interactivo debe migrar a Plotly o mantenerse en SVG.
6. Definir mejor la logica de multiples muestras si reaparece ese caso de uso.
7. Decidir si el perfil de usuario debe crearse automaticamente al iniciar sesion.

## Riesgos / limitaciones actuales

- El procesador local es solo preliminar.
- La revision manual recalcula sobre el perfil muestreado mostrado en UI.
- La calibracion actual del backend esta basada en casos sinteticos.
- No hay validacion clinica final todavia.

## Recomendacion para retomar despues

El siguiente paso con mas valor tecnico es:

1. reunir un set pequeno de estudios reales anonimizados
2. contrastar salida del backend con resultados validados
3. ajustar `backend/app/default_calibration.json`
4. despues sumar rangos de referencia clinicos en la interfaz
