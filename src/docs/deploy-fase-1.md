# Despliegue Fase 1

## Objetivo

Entregar el sistema con esta arquitectura:

- Frontend `React + Vite + PWA` en `Vercel`
- Backend `FastAPI + OpenCV + NumPy + SciPy` en `Render` usando `Docker`
- Base de datos, auth y storage en `Supabase`

Esta fase no busca modo offline clinico completo. La PWA se instala en la PC, pero los datos y el procesamiento siguen dependiendo de red.

## Variables de entorno

Frontend (`.env.local` o variables del proyecto en Vercel):

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_ANALYSIS_API_URL=https://your-analysis-api.onrender.com
```

Backend (`Render`):

```env
ALLOWED_ORIGINS=https://your-frontend.vercel.app
PROSOFT_CALIBRATION_FILE=/app/app/default_calibration.json
PORT=8000
```

## Frontend en Vercel

1. Importar el repositorio en `Vercel`.
2. Detectar el proyecto como `Vite`.
3. Confirmar:
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Cargar las variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ANALYSIS_API_URL`
5. Desplegar.

Notas:

- El archivo `vercel.json` ya deja resuelto el rewrite para SPA y evita cache agresivo sobre `sw.js`.
- La PWA solo sera instalable sobre `https` o `localhost`.

## Backend en Render

Opcion recomendada para esta fase: `Web Service` con runtime `Docker`.

El repositorio ya incluye `render.yaml`, `backend/Dockerfile` y `backend/.dockerignore`.

Pasos:

1. Crear un `Blueprint` o `Web Service` desde el repo.
2. Si usas el blueprint, completar `ALLOWED_ORIGINS` cuando Render lo pida.
3. Verificar que el servicio responda:
   - `/health`
   - `/api/v1/calibration`
4. Copiar la URL publica del backend y usarla en `VITE_ANALYSIS_API_URL` del frontend.

Notas:

- El backend ahora toma `PORT` desde el entorno del hosting y usa `8000` como fallback.
- Si queres cambiar la calibracion, monta otro archivo y redefine `PROSOFT_CALIBRATION_FILE`.

## Supabase

Checklist minimo:

- Confirmar que las tablas productivas existan.
- Confirmar que exista el bucket `electroforesis-imagenes`.
- Revisar policies de `storage.objects` segun si el bucket es publico o privado.
- Configurar `Site URL` y `Redirect URLs` con la URL productiva del frontend.
- Si usas previews de Vercel con auth por redirect, agregar el wildcard del dominio preview.

## Entregable funcional

La validacion minima de la fase 1 es:

1. Login correcto.
2. Alta o busqueda de paciente.
3. Carga de muestra e imagen.
4. Procesamiento desde `NuevoAnalisisPage`.
5. Guardado del analisis.
6. Consulta en `Historial de muestras`.
7. Instalacion de la PWA desde navegador en una PC.

## Riesgos a tener en cuenta

- La PWA instala el frontend, no el backend Python.
- Si el backend no responde, el sistema puede caer al procesador local si el frontend queda configurado para eso.
- La calibracion actual del backend sigue necesitando contraste con estudios reales del equipo.
- Si se publican cambios frecuentes, conviene avisar operativamente que la PWA puede actualizar el shell del frontend.
