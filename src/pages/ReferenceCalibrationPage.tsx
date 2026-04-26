import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, SlidersHorizontal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import TopBar from '../components/TopBar'
import { supabase } from '../lib/supabase'

type FraccionKey = 'albumina' | 'alfa_1' | 'alfa_2' | 'beta_1' | 'beta_2' | 'gamma'

type ReferenceCalibrationRow = {
  analisis_id: string
  paciente_id: string
  numero_placa: string | null
  numero_muestra: string | null
  numero_paciente: string | null
  estado: string | null
  fecha_hora_analisis: string | null
  updated_at: string | null
  paciente_codigo: string | null
  dni: string | null
  nombre: string | null
  apellido: string | null
  version: string | null
  source: string | null
  pattern: string | null
  processor_source: string | null
  algorithm_version: string | null
  calibration_profile: string | null
  calibration_version: string | null
  targets: Record<string, unknown> | null
  applied_ranges: Record<string, unknown> | null
  processor_ranges: Record<string, unknown> | null
  crop_used: Record<string, unknown> | null
  peaks: unknown[] | null
  valleys: unknown[] | null
  axis: string | null
  profile_length: number | null
  total_area: number | null
  total_target: number | null
  reference_updated_at: string | null
}

type FractionDetail = {
  key: FraccionKey
  label: string
  target: number | null
  reviewRange: string
  processorRange: string
  reviewPercentage: number | null
  processorPercentage: number | null
}

const fracciones: Array<{ key: FraccionKey; label: string }> = [
  { key: 'albumina', label: 'Albumina' },
  { key: 'alfa_1', label: 'Alfa 1' },
  { key: 'alfa_2', label: 'Alfa 2' },
  { key: 'beta_1', label: 'Beta 1' },
  { key: 'beta_2', label: 'Beta 2' },
  { key: 'gamma', label: 'Gamma' },
]

const CALIBRATION_PATTERN_LABELS: Record<string, string> = {
  normal: 'Normal',
  gamma_alta: 'Gamma alta',
  beta_gamma_bridge: 'Puente beta/gamma',
  albumina_baja: 'Albumina baja',
  inflamatorio: 'Inflamatorio',
  otro: 'Otro',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function formatDisplayValue(value: string | null | undefined, fallback = '---') {
  return value && value.trim() ? value : fallback
}

function formatDateTime(value: string | null) {
  if (!value) return '---'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatNumber(value: number | null | undefined, suffix = '') {
  if (value == null || !Number.isFinite(value)) return '---'
  return `${value.toFixed(2)}${suffix}`
}

function formatPercentRange(source: Record<string, unknown> | null, key: FraccionKey) {
  if (!source || !isRecord(source[key])) return '---'
  const fraction = source[key]
  if (!isRecord(fraction)) return '---'

  const startPercent = parseNumber(fraction.start_percent)
  const endPercent = parseNumber(fraction.end_percent)
  if (startPercent == null || endPercent == null) return '---'
  return `${startPercent.toFixed(1)}% - ${endPercent.toFixed(1)}%`
}

function formatIndexList(values: unknown[] | null) {
  if (!Array.isArray(values) || values.length === 0) return '---'
  return values
    .map(parseNumber)
    .filter((value): value is number => value != null)
    .map(value => value.toFixed(0))
    .join(', ')
}

function buildFractionDetails(row: ReferenceCalibrationRow): FractionDetail[] {
  return fracciones.map(fraccion => {
    const target = row.targets && isRecord(row.targets) ? parseNumber(row.targets[fraccion.key]) : null
    const appliedFraction = row.applied_ranges && isRecord(row.applied_ranges) && isRecord(row.applied_ranges[fraccion.key])
      ? row.applied_ranges[fraccion.key] as Record<string, unknown>
      : null
    const processorFraction = row.processor_ranges && isRecord(row.processor_ranges) && isRecord(row.processor_ranges[fraccion.key])
      ? row.processor_ranges[fraccion.key] as Record<string, unknown>
      : null

    return {
      key: fraccion.key,
      label: fraccion.label,
      target,
      reviewRange: formatPercentRange(row.applied_ranges, fraccion.key),
      processorRange: formatPercentRange(row.processor_ranges, fraccion.key),
      reviewPercentage: appliedFraction ? parseNumber(appliedFraction.percentage) : null,
      processorPercentage: processorFraction ? parseNumber(processorFraction.percentage) : null,
    }
  })
}

function processorSourceLabel(source: string | null) {
  if (source === 'backend_fastapi') return 'Backend FastAPI'
  if (source === 'frontend_local_fallback') return 'Respaldo local'
  return '---'
}

function calibrationPatternLabel(pattern: string | null) {
  if (!pattern) return '---'
  return CALIBRATION_PATTERN_LABELS[pattern] ?? pattern
}

export default function ReferenceCalibrationPage() {
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState('reference-calibration')
  const [rows, setRows] = useState<ReferenceCalibrationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedAnalisisId, setSelectedAnalisisId] = useState<string | null>(null)

  useEffect(() => {
    async function loadReferenceCalibration() {
      setLoading(true)
      setError('')

      const { data, error: queryError } = await supabase
        .from('reference_calibration')
        .select('analisis_id,paciente_id,numero_placa,numero_muestra,numero_paciente,estado,fecha_hora_analisis,updated_at,paciente_codigo,dni,nombre,apellido,version,source,pattern,processor_source,algorithm_version,calibration_profile,calibration_version,targets,applied_ranges,processor_ranges,crop_used,peaks,valleys,axis,profile_length,total_area,total_target,reference_updated_at')
        .order('reference_updated_at', { ascending: false, nullsFirst: false })
        .returns<ReferenceCalibrationRow[]>()

      if (queryError) {
        setRows([])
        setSelectedAnalisisId(null)
        setError(`No se pudo leer la vista \`reference_calibration\`. Ejecuta el SQL de [reference-calibration-view.sql](/e:/GitHub/ProSoft_V2/ProSoft%20V2/src/docs/reference-calibration-view.sql) en Supabase. Detalle: ${queryError.message}`)
        setLoading(false)
        return
      }

      const nextRows = data ?? []
      setRows(nextRows)
      setSelectedAnalisisId(current => current && nextRows.some(row => row.analisis_id === current)
        ? current
        : nextRows[0]?.analisis_id ?? null)
      setLoading(false)
    }

    loadReferenceCalibration()
  }, [])

  const selectedRow = useMemo(
    () => rows.find(row => row.analisis_id === selectedAnalisisId) ?? rows[0] ?? null,
    [rows, selectedAnalisisId],
  )

  const fractionDetails = useMemo(
    () => selectedRow ? buildFractionDetails(selectedRow) : [],
    [selectedRow],
  )

  return (
    <div className="flex min-h-screen" style={{ background: 'linear-gradient(135deg, #EEF1F3, #E5EAED)' }}>
      <Sidebar active={activeSection} onSelect={setActiveSection} />

      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />

        <main className="flex-1 p-8">
          <div className="flex items-center gap-2 mb-6">
            <SlidersHorizontal size={22} style={{ color: '#5C894A' }} />
            <h1 className="text-2xl font-semibold" style={{ color: '#5C894A' }}>Reference Calibration</h1>
          </div>

          {error && (
            <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#C0392B' }}>
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_380px] gap-5">
            <section className="rounded-2xl p-5" style={{ background: 'linear-gradient(160deg, #FBFBFC, #FAF9FB)', border: '1px solid #DFE0E5', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#5C894A' }}>Calibraciones guardadas</p>
                  <p className="text-xs mt-1" style={{ color: '#6B7178' }}>
                    {loading ? 'Cargando...' : `${rows.length} analisis con calibracion PDF persistida`}
                  </p>
                </div>
              </div>

              <div className="overflow-auto rounded-xl" style={{ border: '1px solid #DFE0E5' }}>
                <table className="w-full text-sm">
                  <thead style={{ background: '#F4F5F7' }}>
                    <tr>
                      <th className="text-left px-3 py-3" style={{ color: '#5C894A' }}>Fecha</th>
                      <th className="text-left px-3 py-3" style={{ color: '#5C894A' }}>Paciente</th>
                      <th className="text-left px-3 py-3" style={{ color: '#5C894A' }}>Muestra</th>
                      <th className="text-left px-3 py-3" style={{ color: '#5C894A' }}>Patron</th>
                      <th className="text-left px-3 py-3" style={{ color: '#5C894A' }}>Motor</th>
                      <th className="text-right px-3 py-3" style={{ color: '#5C894A' }}>Alb %</th>
                      <th className="text-right px-3 py-3" style={{ color: '#5C894A' }}>Gamma %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-10 text-center text-sm" style={{ color: '#6B7178' }}>
                          Cargando calibraciones...
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-10 text-center text-sm" style={{ color: '#6B7178' }}>
                          No hay calibraciones PDF guardadas todavia.
                        </td>
                      </tr>
                    ) : rows.map(row => {
                      const targets = row.targets && isRecord(row.targets) ? row.targets : null
                      const albumina = targets ? parseNumber(targets.albumina) : null
                      const gamma = targets ? parseNumber(targets.gamma) : null
                      const isActive = selectedRow?.analisis_id === row.analisis_id

                      return (
                        <tr
                          key={row.analisis_id}
                          onClick={() => setSelectedAnalisisId(row.analisis_id)}
                          className="cursor-pointer transition"
                          style={{
                            borderTop: '1px solid #EDF0F2',
                            background: isActive ? 'rgba(148,187,102,0.08)' : '#FFFFFF',
                          }}
                        >
                          <td className="px-3 py-3" style={{ color: '#54585E' }}>{formatDateTime(row.reference_updated_at ?? row.updated_at)}</td>
                          <td className="px-3 py-3" style={{ color: '#54585E' }}>
                            <div className="font-medium">{`${formatDisplayValue(row.apellido, '')} ${formatDisplayValue(row.nombre, '')}`.trim() || '---'}</div>
                            <div className="text-xs" style={{ color: '#6B7178' }}>DNI: {formatDisplayValue(row.dni)}</div>
                          </td>
                          <td className="px-3 py-3" style={{ color: '#54585E' }}>
                            <div className="font-medium">{formatDisplayValue(row.numero_muestra)}</div>
                            <div className="text-xs" style={{ color: '#6B7178' }}>Placa: {formatDisplayValue(row.numero_placa)}</div>
                          </td>
                          <td className="px-3 py-3" style={{ color: '#54585E' }}>{calibrationPatternLabel(row.pattern)}</td>
                          <td className="px-3 py-3" style={{ color: '#54585E' }}>
                            <div>{processorSourceLabel(row.processor_source)}</div>
                            <div className="text-xs" style={{ color: '#6B7178' }}>{formatDisplayValue(row.algorithm_version)}</div>
                          </td>
                          <td className="px-3 py-3 text-right" style={{ color: '#54585E' }}>{formatNumber(albumina, '%')}</td>
                          <td className="px-3 py-3 text-right" style={{ color: '#54585E' }}>{formatNumber(gamma, '%')}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl p-5" style={{ background: 'linear-gradient(160deg, #FBFBFC, #FAF9FB)', border: '1px solid #DFE0E5', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <p className="text-sm font-semibold mb-4" style={{ color: '#5C894A' }}>Detalle de calibracion</p>

              {!selectedRow ? (
                <div className="rounded-xl px-4 py-8 text-sm" style={{ background: '#FFFFFF', border: '1px dashed #DFE0E5', color: '#6B7178' }}>
                  Selecciona una calibracion para ver el detalle.
                </div>
              ) : (
                <div className="flex flex-col gap-4 text-sm">
                  <div className="rounded-xl p-3" style={{ background: '#FFFFFF', border: '1px solid #DFE0E5' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold" style={{ color: '#54585E' }}>
                          {`${formatDisplayValue(selectedRow.apellido, '')} ${formatDisplayValue(selectedRow.nombre, '')}`.trim() || 'Paciente sin nombre'}
                        </p>
                        <p className="text-xs mt-1" style={{ color: '#6B7178' }}>
                          Muestra {formatDisplayValue(selectedRow.numero_muestra)} | Placa {formatDisplayValue(selectedRow.numero_placa)}
                        </p>
                        <p className="text-xs mt-1" style={{ color: '#6B7178' }}>
                          Codigo {formatDisplayValue(selectedRow.paciente_codigo)} | DNI {formatDisplayValue(selectedRow.dni)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate(`/analisis/nuevo?paciente_id=${selectedRow.paciente_id}&analisis_id=${selectedRow.analisis_id}`)}
                        className="rounded-lg px-3 py-2 text-xs font-medium transition"
                        style={{ background: '#FFFFFF', color: '#54585E', border: '1px solid #DFE0E5' }}
                      >
                        <span className="inline-flex items-center gap-1">
                          <ExternalLink size={13} />
                          Abrir
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl p-3" style={{ background: '#F4F5F7', border: '1px solid #DFE0E5' }}>
                      <p className="text-[11px] font-semibold" style={{ color: '#6B7178' }}>Motor</p>
                      <p className="mt-1 font-semibold" style={{ color: '#54585E' }}>{processorSourceLabel(selectedRow.processor_source)}</p>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: '#F4F5F7', border: '1px solid #DFE0E5' }}>
                      <p className="text-[11px] font-semibold" style={{ color: '#6B7178' }}>Patron</p>
                      <p className="mt-1 font-semibold" style={{ color: '#54585E' }}>{calibrationPatternLabel(selectedRow.pattern)}</p>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: '#F4F5F7', border: '1px solid #DFE0E5' }}>
                      <p className="text-[11px] font-semibold" style={{ color: '#6B7178' }}>Perfil</p>
                      <p className="mt-1 font-semibold" style={{ color: '#54585E' }}>{formatNumber(selectedRow.profile_length, '')} puntos</p>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: '#F4F5F7', border: '1px solid #DFE0E5' }}>
                      <p className="text-[11px] font-semibold" style={{ color: '#6B7178' }}>Eje</p>
                      <p className="mt-1 font-semibold" style={{ color: '#54585E' }}>{formatDisplayValue(selectedRow.axis?.toUpperCase())}</p>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: '#F4F5F7', border: '1px solid #DFE0E5' }}>
                      <p className="text-[11px] font-semibold" style={{ color: '#6B7178' }}>Area total</p>
                      <p className="mt-1 font-semibold" style={{ color: '#54585E' }}>{formatNumber(selectedRow.total_area)}</p>
                    </div>
                  </div>

                  <div className="rounded-xl p-3" style={{ background: '#FFFFFF', border: '1px solid #DFE0E5' }}>
                    <p className="font-semibold" style={{ color: '#5C894A' }}>Crop y deteccion</p>
                    <p className="text-xs mt-2" style={{ color: '#6B7178' }}>
                      Crop: {isRecord(selectedRow.crop_used)
                        ? `x ${formatNumber(parseNumber(selectedRow.crop_used.left), '')}, y ${formatNumber(parseNumber(selectedRow.crop_used.top), '')}, ancho ${formatNumber(parseNumber(selectedRow.crop_used.width), '')}, alto ${formatNumber(parseNumber(selectedRow.crop_used.height), '')}`
                        : '---'}
                    </p>
                    <p className="text-xs mt-1" style={{ color: '#6B7178' }}>Picos: {formatIndexList(selectedRow.peaks)}</p>
                    <p className="text-xs mt-1" style={{ color: '#6B7178' }}>Minimos: {formatIndexList(selectedRow.valleys)}</p>
                  </div>

                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #DFE0E5' }}>
                    <table className="w-full text-[11px]">
                      <thead style={{ background: '#F4F5F7' }}>
                        <tr>
                          <th className="text-left px-2 py-2" style={{ color: '#5C894A' }}>Fraccion</th>
                          <th className="text-right px-2 py-2" style={{ color: '#54585E' }}>PDF %</th>
                          <th className="text-right px-2 py-2" style={{ color: '#54585E' }}>Tabla %</th>
                          <th className="text-right px-2 py-2" style={{ color: '#54585E' }}>Motor %</th>
                          <th className="text-right px-2 py-2" style={{ color: '#54585E' }}>Rango tabla</th>
                          <th className="text-right px-2 py-2" style={{ color: '#54585E' }}>Rango motor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fractionDetails.map(detail => (
                          <tr key={detail.key} style={{ borderTop: '1px solid #EDF0F2' }}>
                            <td className="px-2 py-1.5 font-semibold" style={{ color: '#54585E' }}>{detail.label}</td>
                            <td className="px-2 py-1.5 text-right" style={{ color: '#54585E' }}>{formatNumber(detail.target, '%')}</td>
                            <td className="px-2 py-1.5 text-right" style={{ color: '#54585E' }}>{formatNumber(detail.reviewPercentage, '%')}</td>
                            <td className="px-2 py-1.5 text-right" style={{ color: '#54585E' }}>{formatNumber(detail.processorPercentage, '%')}</td>
                            <td className="px-2 py-1.5 text-right" style={{ color: '#6B7178' }}>{detail.reviewRange}</td>
                            <td className="px-2 py-1.5 text-right" style={{ color: '#6B7178' }}>{detail.processorRange}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="rounded-xl p-3" style={{ background: '#FFFFFF', border: '1px solid #DFE0E5' }}>
                    <p className="font-semibold" style={{ color: '#5C894A' }}>Versiones</p>
                    <p className="text-xs mt-2" style={{ color: '#6B7178' }}>Reference calibration: {formatDisplayValue(selectedRow.version)}</p>
                    <p className="text-xs mt-1" style={{ color: '#6B7178' }}>Algoritmo: {formatDisplayValue(selectedRow.algorithm_version)}</p>
                    <p className="text-xs mt-1" style={{ color: '#6B7178' }}>Perfil de calibracion: {formatDisplayValue(selectedRow.calibration_profile)}</p>
                    <p className="text-xs mt-1" style={{ color: '#6B7178' }}>Version de calibracion: {formatDisplayValue(selectedRow.calibration_version)}</p>
                  </div>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}
