import { useState, useEffect, Fragment } from 'react'
import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import TopBar from '../components/TopBar'
import { supabase } from '../lib/supabase'

type Paciente = {
  id: string
  paciente_codigo: string | null
  dni: string | null
  nombre: string
  apellido: string
  fecha_nacimiento: string | null
  sexo: string | null
  obra_social: string | null
  activo: boolean
}

type Analisis = {
  id: string
  fecha_hora_analisis: string
  estado: string
  numero_placa: string | null
  numero_muestra: string | null
  concentracion_total: number | null
  albumina_porcentaje: number | null
  albumina_concentracion: number | null
  alfa_1_porcentaje: number | null
  alfa_1_concentracion: number | null
  alfa_2_porcentaje: number | null
  alfa_2_concentracion: number | null
  beta_1_porcentaje: number | null
  beta_1_concentracion: number | null
  beta_2_porcentaje: number | null
  beta_2_concentracion: number | null
  gamma_porcentaje: number | null
  gamma_concentracion: number | null
  observaciones_generales: string | null
  equipo_origen: string | null
  modelo_equipo: string | null
}

const estadoStyle: Record<string, { bg: string; color: string; border: string }> = {
  pendiente: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  procesado: { bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe' },
  validado:  { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  observado: { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  anulado:   { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
}

const fracciones: { key: string; label: string }[] = [
  { key: 'albumina', label: 'Albúmina' },
  { key: 'alfa_1',   label: 'α1-Globulina' },
  { key: 'alfa_2',   label: 'α2-Globulina' },
  { key: 'beta_1',   label: 'β1-Globulina' },
  { key: 'beta_2',   label: 'β2-Globulina' },
  { key: 'gamma',    label: 'γ-Globulina' },
]

function EstadoBadge({ estado }: { estado: string }) {
  const s = estadoStyle[estado] ?? { bg: '#f3f4f6', color: '#374151', border: '#e5e7eb' }
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {estado.charAt(0).toUpperCase() + estado.slice(1)}
    </span>
  )
}

function fmt(n: number | null | undefined) {
  return n != null ? n.toFixed(2) : '—'
}

function fmtFecha(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-AR')
}

export default function PacientesLista() {
  const [activeSection, setActiveSection] = useState('pacientes')
  const [pacientes, setPacientes] = useState<Paciente[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [analisisMap, setAnalisisMap] = useState<Record<string, Analisis[]>>({})
  const [loadingAnalisis, setLoadingAnalisis] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPacientes() {
      setLoading(true)
      const { data } = await supabase
        .from('pacientes')
        .select('id, paciente_codigo, dni, nombre, apellido, fecha_nacimiento, sexo, obra_social, activo')
        .order('apellido', { ascending: true })
      setPacientes(data ?? [])
      setLoading(false)
    }
    fetchPacientes()
  }, [])

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (analisisMap[id] !== undefined) return

    setLoadingAnalisis(id)
    const { data } = await supabase
      .from('analisis_electroforesis')
      .select('*')
      .eq('paciente_id', id)
      .order('fecha_hora_analisis', { ascending: false })
    setAnalisisMap(prev => ({ ...prev, [id]: data ?? [] }))
    setLoadingAnalisis(null)
  }

  const filtered = pacientes.filter(p => {
    const q = search.toLowerCase()
    return (
      p.nombre.toLowerCase().includes(q) ||
      p.apellido.toLowerCase().includes(q) ||
      (p.dni ?? '').includes(q) ||
      (p.paciente_codigo ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="flex min-h-screen" style={{ background: 'linear-gradient(135deg, #EEF1F3, #E5EAED)' }}>
      <Sidebar active={activeSection} onSelect={setActiveSection} />

      <div className="flex flex-col flex-1">
        <TopBar name="Usuario" role="Cargo" />

        <main className="flex-1 p-10">
          <h1 className="text-2xl font-semibold mb-1" style={{ color: '#5C894A' }}>
            Pacientes
          </h1>
          <p className="text-sm mb-6" style={{ color: '#54585E' }}>
            Listado de pacientes registrados. Expandí cada fila para ver sus análisis.
          </p>

          {/* Buscador */}
          <div className="flex items-center gap-3 mb-5">
            <div className="relative" style={{ width: 340 }}>
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: '#94BB66' }}
              />
              <input
                type="text"
                placeholder="Buscar por nombre, apellido, DNI o código..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-lg pl-9 pr-3 py-2 text-sm outline-none transition"
                style={{ background: '#FFFFFF', color: '#54585E', border: '1px solid #DFE0E5' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#5C894A')}
                onBlur={e => (e.currentTarget.style.borderColor = '#DFE0E5')}
              />
            </div>
            <span className="text-xs" style={{ color: '#54585E' }}>
              {filtered.length} paciente{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Tabla */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(160deg, #FBFBFC, #FAF9FB)',
              border: '1px solid #DFE0E5',
              boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
            }}
          >
            {loading ? (
              <div className="p-12 text-center text-sm" style={{ color: '#54585E' }}>
                Cargando pacientes...
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-sm" style={{ color: '#54585E' }}>
                No se encontraron pacientes.
              </div>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr style={{ background: 'rgba(92,137,74,0.07)', borderBottom: '1px solid #DFE0E5' }}>
                    {['Código', 'DNI', 'Apellido y Nombre', 'Nacimiento', 'Sexo', 'Obra Social', 'Estado', ''].map(h => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold whitespace-nowrap"
                        style={{ color: '#5C894A' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => (
                    <Fragment key={p.id}>
                      <tr
                        style={{
                          background: i % 2 === 0 ? '#FFFFFF' : 'rgba(223,224,229,0.15)',
                          borderBottom: expandedId === p.id ? 'none' : '1px solid #DFE0E5',
                        }}
                      >
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: '#54585E' }}>
                          {p.paciente_codigo ?? '—'}
                        </td>
                        <td className="px-4 py-3" style={{ color: '#54585E' }}>
                          {p.dni ?? '—'}
                        </td>
                        <td className="px-4 py-3 font-medium" style={{ color: '#54585E' }}>
                          {p.apellido}, {p.nombre}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: '#54585E' }}>
                          {fmtFecha(p.fecha_nacimiento)}
                        </td>
                        <td className="px-4 py-3 capitalize" style={{ color: '#54585E' }}>
                          {p.sexo ?? '—'}
                        </td>
                        <td className="px-4 py-3" style={{ color: '#54585E' }}>
                          {p.obra_social ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={
                              p.activo
                                ? { background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }
                                : { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }
                            }
                          >
                            {p.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleExpand(p.id)}
                            className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                            style={{
                              color: '#5C894A',
                              border: '1px solid #94BB66',
                              background: expandedId === p.id ? 'rgba(92,137,74,0.10)' : 'transparent',
                            }}
                          >
                            {expandedId === p.id
                              ? <><ChevronUp size={13} /> Cerrar</>
                              : <><ChevronDown size={13} /> Ver más</>
                            }
                          </button>
                        </td>
                      </tr>

                      {/* Panel expandido: análisis */}
                      {expandedId === p.id && (
                        <tr>
                          <td
                            colSpan={8}
                            style={{
                              background: 'rgba(92,137,74,0.04)',
                              borderBottom: '1px solid #DFE0E5',
                              padding: 0,
                            }}
                          >
                            <div className="px-6 py-5">
                              <p className="text-xs font-semibold mb-3" style={{ color: '#5C894A' }}>
                                Análisis de Electroforesis
                              </p>

                              {loadingAnalisis === p.id ? (
                                <p className="text-xs" style={{ color: '#54585E' }}>Cargando análisis...</p>
                              ) : analisisMap[p.id]?.length === 0 ? (
                                <p className="text-xs" style={{ color: '#54585E' }}>Sin análisis registrados para este paciente.</p>
                              ) : (
                                <div className="flex flex-col gap-3">
                                  {(analisisMap[p.id] ?? []).map(a => (
                                    <div
                                      key={a.id}
                                      className="rounded-xl p-4"
                                      style={{ background: '#FFFFFF', border: '1px solid #DFE0E5' }}
                                    >
                                      {/* Cabecera del análisis */}
                                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3">
                                        <EstadoBadge estado={a.estado} />
                                        <span className="text-xs" style={{ color: '#54585E' }}>
                                          {new Date(a.fecha_hora_analisis).toLocaleString('es-AR')}
                                        </span>
                                        {a.numero_placa && (
                                          <span className="text-xs" style={{ color: '#54585E' }}>
                                            Placa: <strong>{a.numero_placa}</strong>
                                          </span>
                                        )}
                                        {a.numero_muestra && (
                                          <span className="text-xs" style={{ color: '#54585E' }}>
                                            Muestra: <strong>{a.numero_muestra}</strong>
                                          </span>
                                        )}
                                        {a.concentracion_total != null && (
                                          <span className="text-xs" style={{ color: '#54585E' }}>
                                            Conc. total: <strong>{fmt(a.concentracion_total)} g/dL</strong>
                                          </span>
                                        )}
                                        {a.equipo_origen && (
                                          <span className="text-xs" style={{ color: '#94BB66' }}>
                                            {a.equipo_origen}{a.modelo_equipo ? ` · ${a.modelo_equipo}` : ''}
                                          </span>
                                        )}
                                      </div>

                                      {/* Fracciones */}
                                      <div className="overflow-x-auto">
                                        <table className="text-xs border-collapse" style={{ minWidth: 420 }}>
                                          <thead>
                                            <tr style={{ borderBottom: '1px solid #DFE0E5' }}>
                                              <th className="px-3 py-1.5 text-left font-semibold" style={{ color: '#5C894A' }}>
                                                Fracción
                                              </th>
                                              <th className="px-3 py-1.5 text-right font-semibold" style={{ color: '#5C894A' }}>
                                                %
                                              </th>
                                              <th className="px-3 py-1.5 text-right font-semibold" style={{ color: '#5C894A' }}>
                                                g/dL
                                              </th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {fracciones.map(f => (
                                              <tr key={f.key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                <td className="px-3 py-1" style={{ color: '#54585E' }}>
                                                  {f.label}
                                                </td>
                                                <td className="px-3 py-1 text-right font-mono" style={{ color: '#54585E' }}>
                                                  {fmt((a as unknown as Record<string, number | null>)[`${f.key}_porcentaje`])}
                                                </td>
                                                <td className="px-3 py-1 text-right font-mono" style={{ color: '#54585E' }}>
                                                  {fmt((a as unknown as Record<string, number | null>)[`${f.key}_concentracion`])}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>

                                      {a.observaciones_generales && (
                                        <p className="mt-3 text-xs" style={{ color: '#54585E' }}>
                                          <span style={{ color: '#5C894A', fontWeight: 600 }}>Observaciones: </span>
                                          {a.observaciones_generales}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
