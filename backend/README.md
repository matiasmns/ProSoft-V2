# Backend de Analisis

Servicio `FastAPI` para procesar imagenes de electroforesis con `OpenCV + NumPy + SciPy`.

## Ejecutar local

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Endpoint principal

`POST /api/v1/analysis/process`

## Endpoint de calibracion

`GET /api/v1/calibration`

Devuelve el perfil de calibracion activo, con ventanas de fracciones y umbrales del algoritmo. Si queres usar un archivo distinto al default, setea `PROSOFT_CALIBRATION_FILE`.

Campos `multipart/form-data`:

- `file`: imagen del estudio
- `crop_left`
- `crop_top`
- `crop_width`
- `crop_height`
- `crop_separation`
- `total_concentration`

El frontend puede apuntar al backend mediante `VITE_ANALYSIS_API_URL`. Si esa variable no existe, el frontend no intenta usar FastAPI y procesa solo en local.

## Calibracion sintetica

Sin dataset clinico en el repo, la calibracion actual se apoya en casos sinteticos para evitar regresiones mientras se ajusta el algoritmo.

```powershell
cd backend
.venv\Scripts\python.exe scripts\run_synthetic_calibration.py
.venv\Scripts\python.exe -m unittest discover -s tests
```

## Docker

```powershell
cd backend
docker build -t prosoft-analysis-api .
docker run --rm -p 8000:8000 prosoft-analysis-api
```

El contenedor usa `PORT` si el hosting lo define y cae a `8000` como valor por defecto.

## Variables de entorno

```env
ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,https://your-frontend.vercel.app
PROSOFT_CALIBRATION_FILE=/app/app/default_calibration.json
PORT=8000
```

## Deploy recomendado

Para la fase 1 del entregable:

- frontend en `Vercel`
- backend en `Render` con `runtime: docker`

El repo ya incluye `render.yaml` para crear el servicio del backend.
