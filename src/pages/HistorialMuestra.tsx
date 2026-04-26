import { useEffect, useMemo, useState } from 'react'
import { ArrowUpDown, ChevronLeft, ChevronRight, ClipboardList, ExternalLink, ImageIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import TopBar from '../components/TopBar'
import { supabase } from '../lib/supabase'

type SortField = 'fecha_hora_analisis' | 'updated_at' | 'numero_muestra' | 'numero_placa' | 'estado'
type SortDirection = 'asc' | 'desc'
type ImageType = 'densitograma' | 'reporte' | 'otro'

type AnalisisHistoriaRow = {
  id: string
  paciente_id: string
  numero_placa: string | null
  numero_muestra: string | null
  numero_paciente: string | null
  cantidad_picos: number | null
  concentracion_total: number | null
  fecha_hora_analisis: string
  estado: string
  resultado_crudo: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type PacienteRow = {
  id: string
  paciente_codigo: string | null
  dni: string | null
  nombre: string
  apellido: string
  fecha_nacimiento: string | null
  sexo: string | null
}

type AnalisisImagenRow = {
  analisis_id: string
  tipo: ImageType | null
  url: string
  nombre_archivo: string | null
}

type ProcessorProfilePoint = {
  x: number
  y: number
}

type HistorialRow = {
  analisis: AnalisisHistoriaRow
  paciente: PacienteRow | null
  imagenes: AnalisisImagenRow[]
  profile: ProcessorProfilePoint[] | null
  detectedPeaks: number | null
}

const PAGE_SIZE_OPTIONS = [8, 12, 20]
const SORT_OPTIONS: Array<{ value: SortField; label: string }> = [
  { value: 'fecha_hora_analisis', label: 'Fecha de analisis' },
  { value: 'updated_at', label: 'Actualizacion' },
  { value: 'numero_muestra', label: 'Nro. muestra' },
  { value: 'numero_placa', label: 'Nro. placa' },
  { value: 'estado', label: 'Estado' },
]

const estadoStyle: Record<string, { bg: string; color: string; border: string }> = {
  pendiente: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  procesado: { bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe' },
  validado: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  observado: { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  anulado: { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
}

const inputClass = 'w-full rounded-lg px-3 py-2 text-sm outline-none transition'
const inputStyle = { background: '#FFFFFF', color: '#54585E', border: '1px solid #DFE0E5' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function readStoredProfile(rawResult: Record<string, unknown> | null) {
  const localProcessor = rawResult?.local_processor
  if (!isRecord(localProcessor) || !Array.isArray(localProcessor.profile)) return null

  const profile = localProcessor.profile.flatMap(point => {
    if (!isRecord(point) || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) return []
    return [{ x: point.x, y: point.y }]
  })

  return profile.length > 1 ? profile : null
}

function readDetectedPeaks(rawResult: Record<string, unknown> | null) {
  const localProcessor = rawResult?.local_processor
  if (!isRecord(localProcessor) || !isFiniteNumber(localProcessor.detected_peaks)) return null
  return localProcessor.detected_peaks
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

function formatShortDate(value: string | null) {
  if (!value) return '---'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

function formatNumber(value: number | null | undefined, suffix = '') {
  if (value == null || !Number.isFinite(value)) return '---'
  return `${value.toFixed(2)}${suffix}`
}

function EstadoBadge({ estado }: { estado: string }) {
  const current = estadoStyle[estado] ?? { bg: '#F4F5F7', color: '#54585E', border: '#DFE0E5' }
  return (
    <span
      className="px-2 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: current.bg, color: current.color, border: `1px solid ${current.border}` }}
    >
      {estado.charAt(0).toUpperCase() + estado.slice(1)}
    </span>
  )
}

function DensitogramaMini({ profile, detectedPeaks }: { profile: ProcessorProfilePoint[] | null; detectedPeaks: number | null }) {
  if (!profile) {
    return (
      <div
        className="w-52 h-[76px] rounded-xl flex flex-col items-center justify-center gap-1 text-[11px]"
        style={{ background: '#F4F5F7', border: '1px dashed #DFE0E5', color: '#6B7178' }}
      >
        <ImageIcon size={16} style={{ color: '#94BB66' }} />
        <span>Sin curva guardada</span>
      </div>
    )
  }

  const width = 220
  const height = 76
  const plotLeft = 10
  const plotTop = 8
  const plotWidth = 200
  const plotHeight = 54
  const plotBottom = plotTop + plotHeight
  const points = profile.map(point => `${(plotLeft + point.x * plotWidth).toFixed(1)},${(plotBottom - point.y * plotHeight).toFixed(1)}`).join(' ')
  const areaPoints = `${plotLeft},${plotBottom} ${points} ${plotLeft + plotWidth},${plotBottom}`

  return (
    <div className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-52 h-[76px] rounded-xl"
        style={{ background: '#F6F7F8', border: '1px solid #DFE0E5' }}
      >
        {Array.from({ length: 4 }, (_, index) => {
          const y = plotTop + (index / 3) * plotHeight
          return <line key={`mini-h-${index}`} x1={plotLeft} x2={plotLeft + plotWidth} y1={y} y2={y} stroke="#DFE3E8" strokeWidth="1" />
        })}
        {Array.from({ length: 5 }, (_, index) => {
          const x = plotLeft + (index / 4) * plotWidth
          return <line key={`mini-v-${index}`} x1={x} x2={x} y1={plotTop} y2={plotBottom} stroke="#E6E9ED" strokeWidth="1" />
        })}
        <polygon points={areaPoints} fill="#94BB66" opacity="0.18" />
        <polyline fill="none" stroke="#4A9151" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" points={points} />
      </svg>
      <span className="text-[10px]" style={{ color: '#6B7178' }}>
        {detectedPeaks != null ? `${detectedPeaks} picos detectados` : 'Perfil procesado'}
      </span>
    </div>
  )
}

function buildImageTypeSummary(imagenes: AnalisisImagenRow[]) {
  if (imagenes.length === 0) return [] as Array<{ type: string; count: number }>

  const counts = new Map<string, number>()
  for (const image of imagenes) {
    const key = image.tipo ?? 'otro'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from(counts.entries()).map(([type, count]) => ({ type, count }))
}

export default function HistorialMuestra() {
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState('historial-muestras')
  const [rows, setRows] = useState<HistorialRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(8)
  const [totalCount, setTotalCount] = useState(0)
  const [sortField, setSortField] = useState<SortField>('fecha_hora_analisis')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const effectivePage = Math.min(page, totalPages)
  const pageNumbers = useMemo(() => {
    const start = Math.max(1, Math.min(effectivePage - 2, totalPages - 4))
    const end = Math.min(totalPages, Math.max(effectivePage + 2, 5))
    return Array.from({ length: end - start + 1 }, (_, index) => start + index)
  }, [effectivePage, totalPages])

  useEffect(() => {
    async function loadHistorial() {
      setLoading(true)
      setError('')

      const from = (effectivePage - 1) * pageSize
      const to = from + pageSize - 1

      const { data: analisisData, error: analisisError, count } = await supabase
        .from('analisis_electroforesis')
        .select('id,paciente_id,numero_placa,numero_muestra,numero_paciente,cantidad_picos,concentracion_total,fecha_hora_analisis,estado,resultado_crudo,created_at,updated_at', { count: 'exact' })
        .order(sortField, { ascending: sortDirection === 'asc', nullsFirst: false })
        .range(from, to)
        .returns<AnalisisHistoriaRow[]>()

      if (analisisError) {
        setError(analisisError.message)
        setRows([])
        setTotalCount(0)
        setLoading(false)
        return
      }

      const analisis = analisisData ?? []
      setTotalCount(count ?? 0)

      if (analisis.length === 0) {
        setRows([])
        setLoading(false)
        return
      }

      const pacienteIds = Array.from(new Set(analisis.map(item => item.paciente_id)))
      const analisisIds = analisis.map(item => item.id)

      const [{ data: pacientesData, error: pacientesError }, { data: imagenesData, error: imagenesError }] = await Promise.all([
        supabase
          .from('pacientes')
          .select('id,paciente_codigo,dni,nombre,apellido,fecha_nacimiento,sexo')
          .in('id', pacienteIds)
          .returns<PacienteRow[]>(),
        supabase
          .from('analisis_imagenes')
          .select('analisis_id,tipo,url,nombre_archivo')
          .in('analisis_id', analisisIds)
          .order('created_at', { ascending: true })
          .returns<AnalisisImagenRow[]>(),
      ])

      if (pacientesError || imagenesError) {
        setError(pacientesError?.message ?? imagenesError?.message ?? 'No se pudo cargar el historial.')
        setRows([])
        setLoading(false)
        return
      }

      const pacientesMap = new Map((pacientesData ?? []).map(item => [item.id, item]))
      const imagenesMap = new Map<string, AnalisisImagenRow[]>()

      for (const image of imagenesData ?? []) {
        const current = imagenesMap.get(image.analisis_id) ?? []
        current.push(image)
        imagenesMap.set(image.analisis_id, current)
      }

      const nextRows = analisis.map(item => ({
        analisis: item,
        paciente: pacientesMap.get(item.paciente_id) ?? null,
        imagenes: imagenesMap.get(item.id) ?? [],
        profile: readStoredProfile(item.resultado_crudo),
        detectedPeaks: item.cantidad_picos ?? readDetectedPeaks(item.resultado_crudo),
      }))

      setRows(nextRows)
      setLoading(false)
    }

    loadHistorial()
  }, [effectivePage, pageSize, sortField, sortDirection])

  const visibleFrom = totalCount === 0 ? 0 : (effectivePage - 1) * pageSize + 1
  const visibleTo = totalCount === 0 ? 0 : Math.min(effectivePage * pageSize, totalCount)

  return (
    <div className="flex min-h-screen" style={{ background: 'linear-gradient(135deg, #EEF1F3, #E5EAED)' }}>
      <Sidebar active={activeSection} onSelect={setActiveSection} />

      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />

        <main className="flex-1 p-10">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <ClipboardList size={22} style={{ color: '#5C894A' }} />
                <h1 className="text-2xl font-semibold" style={{ color: '#5C894A' }}>Historial de Muestras</h1>
              </div>
              <p className="text-sm mt-2" style={{ color: '#54585E' }}>
                Tabla paginada de pacientes, muestras, archivos asociados y curva densitometrica guardada por analisis.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[11px] font-semibold mb-1" style={{ color: '#5C894A' }}>Ordenar por</label>
                <select
                  value={sortField}
                  onChange={event => { setSortField(event.target.value as SortField); setPage(1) }}
                  className={inputClass}
                  style={{ ...inputStyle, minWidth: 180 }}
                >
                  {SORT_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold mb-1" style={{ color: '#5C894A' }}>Direccion</label>
                <button
                  type="button"
                  onClick={() => { setSortDirection(current => current === 'asc' ? 'desc' : 'asc'); setPage(1) }}
                  className="rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 transition"
                  style={{ background: '#FFFFFF', color: '#54585E', border: '1px solid #DFE0E5' }}
                >
                  <ArrowUpDown size={15} />
                  {sortDirection === 'asc' ? 'Ascendente' : 'Descendente'}
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-semibold mb-1" style={{ color: '#5C894A' }}>Filas</label>
                <select
                  value={pageSize}
                  onChange={event => { setPageSize(Number(event.target.value)); setPage(1) }}
                  className={inputClass}
                  style={{ ...inputStyle, minWidth: 96 }}
                >
                  {PAGE_SIZE_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#C0392B' }}>
              {error}
            </div>
          )}

          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(160deg, #FBFBFC, #FAF9FB)',
              border: '1px solid #DFE0E5',
              boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" style={{ background: 'rgba(92,137,74,0.07)', borderBottom: '1px solid #DFE0E5' }}>
              <span className="text-xs font-semibold" style={{ color: '#5C894A' }}>
                {loading ? 'Cargando historial...' : `Mostrando ${visibleFrom}-${visibleTo} de ${totalCount} analisis`}
              </span>
              <span className="text-xs" style={{ color: '#54585E' }}>
                Pagina {effectivePage} de {totalPages}
              </span>
            </div>

            {loading ? (
              <div className="p-12 text-center text-sm" style={{ color: '#54585E' }}>
                Cargando historial de muestras...
              </div>
            ) : rows.length === 0 ? (
              <div className="p-12 text-center text-sm" style={{ color: '#54585E' }}>
                Todavia no hay analisis cargados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm" style={{ minWidth: 1180 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #DFE0E5' }}>
                      {['Fecha', 'Paciente', 'Muestra', 'Estado', 'Densitograma', ''].map(header => (
                        <th
                          key={header}
                          className="px-4 py-3 text-left text-sm font-semibold whitespace-nowrap"
                          style={{ color: '#5C894A' }}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => {
                      const imageSummary = buildImageTypeSummary(row.imagenes)
                      const patientLabel = row.paciente ? `${row.paciente.apellido}, ${row.paciente.nombre}` : 'Paciente no disponible'
                      return (
                        <tr
                          key={row.analisis.id}
                          style={{
                            background: index % 2 === 0 ? '#FFFFFF' : 'rgba(223,224,229,0.15)',
                            borderBottom: '1px solid #DFE0E5',
                            verticalAlign: 'top',
                          }}
                        >
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              <span className="text-xs font-semibold" style={{ color: '#54585E' }}>
                                {formatDateTime(row.analisis.fecha_hora_analisis)}
                              </span>
                              <span className="text-[11px]" style={{ color: '#6B7178' }}>
                                Actualizado {formatShortDate(row.analisis.updated_at)}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-xs" style={{ color: '#54585E' }}>{patientLabel}</span>
                              <span className="text-xs" style={{ color: '#6B7178' }}>
                                Cod. {row.paciente?.paciente_codigo ?? '---'} · DNI {row.paciente?.dni ?? '---'}
                              </span>
                              <span className="text-[11px] capitalize" style={{ color: '#6B7178' }}>
                                {row.paciente?.sexo ?? '---'} · Nac. {formatShortDate(row.paciente?.fecha_nacimiento ?? null)}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <div className="flex flex-col gap-1 text-xs" style={{ color: '#54585E' }}>
                              <span><strong>Muestra:</strong> {row.analisis.numero_muestra ?? '---'}</span>
                              <span><strong>Placa:</strong> {row.analisis.numero_placa ?? '---'}</span>
                              <span><strong>Nro. Paciente:</strong> {row.analisis.numero_paciente ?? '---'}</span>
                              <span><strong>Picos:</strong> {row.detectedPeaks ?? row.analisis.cantidad_picos ?? '---'}</span>
                              <span><strong>Conc. total:</strong> {formatNumber(row.analisis.concentracion_total, ' g/dL')}</span>
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <EstadoBadge estado={row.analisis.estado} />
                          </td>

                          <td className="px-4 py-4 hidden">
                            {imageSummary.length === 0 ? (
                              <span className="text-[11px]" style={{ color: '#6B7178' }}>Sin imagenes</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5 max-w-44">
                                {imageSummary.map(item => (
                                  <span
                                    key={`${row.analisis.id}-${item.type}`}
                                    className="px-2 py-1 rounded-full text-[11px] font-semibold"
                                    style={{ background: '#F4F5F7', color: '#54585E', border: '1px solid #DFE0E5' }}
                                  >
                                    {item.type} x{item.count}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-4">
                            <DensitogramaMini profile={row.profile} detectedPeaks={row.detectedPeaks} />
                          </td>

                          <td className="px-4 py-4">
                            <button
                              type="button"
                              onClick={() => navigate(`/analisis/nuevo?paciente_id=${row.analisis.paciente_id}&analisis_id=${row.analisis.id}`)}
                              className="rounded-lg px-3 py-2 text-xs font-semibold flex items-center gap-2 transition"
                              style={{ background: '#FFFFFF', color: '#54585E', border: '1px solid #DFE0E5' }}
                            >
                              <ExternalLink size={14} />
                              Abrir
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" style={{ borderTop: '1px solid #DFE0E5' }}>
              <button
                type="button"
                onClick={() => setPage(Math.max(1, effectivePage - 1))}
                disabled={effectivePage <= 1}
                className="rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 transition disabled:opacity-50"
                style={{ background: '#FFFFFF', color: '#54585E', border: '1px solid #DFE0E5' }}
              >
                <ChevronLeft size={15} />
                Anterior
              </button>

              <div className="flex flex-wrap items-center justify-center gap-1">
                {pageNumbers.map(pageNumber => {
                  const isActive = pageNumber === effectivePage
                  return (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => setPage(pageNumber)}
                      className="min-w-9 rounded-lg px-3 py-2 text-sm font-semibold transition"
                      style={isActive
                        ? { background: '#4A9151', color: '#F1FAEF', border: '1px solid #4A9151' }
                        : { background: '#FFFFFF', color: '#54585E', border: '1px solid #DFE0E5' }}
                    >
                      {pageNumber}
                    </button>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, effectivePage + 1))}
                disabled={effectivePage >= totalPages}
                className="rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 transition disabled:opacity-50"
                style={{ background: '#FFFFFF', color: '#54585E', border: '1px solid #DFE0E5' }}
              >
                Siguiente
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
