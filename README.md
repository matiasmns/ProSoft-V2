# ProSoft V2

Aplicacion para carga de pacientes, muestras y analisis de electroforesis.

## Estado actual

- Frontend en `React + TypeScript + Vite`
- Persistencia en `Supabase`
- Backend de procesamiento en `FastAPI` dentro de `backend/`
- Fallback local de procesamiento en frontend para no bloquear pruebas cuando el backend no esta levantado

## Frontend

```powershell
npm install
npm run dev
```

Variables de entorno:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_ANALYSIS_API_URL=https://your-analysis-api.onrender.com
```

### PWA

- El frontend ahora puede instalarse como PWA.
- El service worker cachea solo el shell estatico de la app y assets del mismo origen.
- Las respuestas de `Supabase` no se cachean desde la PWA; siguen yendo a red para evitar datos clinicos desactualizados.
- Cuando se publica un build nuevo, la app verifica actualizaciones automaticamente y aplica la nueva version del frontend al quedar la pestana en segundo plano.

## Backend

Ver `backend/README.md`.

## Despliegue Fase 1

La opcion recomendada para entregar esta version es:

- frontend en `Vercel`
- backend `FastAPI` en `Render` con `Docker`
- `Supabase` como servicio de datos y storage

Guia operativa: `src/docs/deploy-fase-1.md`

## Flujo principal

1. Alta o busqueda del paciente
2. Carga de muestra e imagenes
3. Creacion del analisis en Supabase
4. Procesamiento desde `NuevoAnalisisPage`
5. Guardado del borrador procesado y revision manual

## Notas

- Si el backend `FastAPI` no responde, el frontend usa el procesador local de respaldo.
- El algoritmo local es solo un prototipo; el camino objetivo es el backend Python con `OpenCV + NumPy + SciPy`.
- La calibracion base del backend vive en `backend/app/default_calibration.json` y hoy esta ajustada con casos sinteticos; falta contrastarla con estudios reales del equipo.
