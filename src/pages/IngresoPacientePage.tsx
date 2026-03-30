import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus, Search, ChevronRight, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Sidebar from '../components/Sidebar'
import TopBar from '../components/TopBar'

type PacienteForm = {
  dni: string
  nombre: string
  apellido: string
  fecha_nacimiento: string
  sexo: string
  telefono: string
  email: string
  obra_social: string
  historia_clinica: string
  observaciones: string
}

const emptyForm: PacienteForm = {
  dni: '',
  nombre: '',
  apellido: '',
  fecha_nacimiento: '',
  sexo: '',
  telefono: '',
  email: '',
  obra_social: '',
  historia_clinica: '',
  observaciones: '',
}

const inputClass = 'w-full rounded-lg px-3 py-2 text-sm outline-none transition'
const inputStyle = {
  background: '#FFFFFF',
  color: '#54585E',
  border: '1px solid #DFE0E5',
}

function FormInput({
  label, name, value, onChange, type = 'text', placeholder = '',
}: {
  label: string
  name: keyof PacienteForm
  value: string
  onChange: (name: keyof PacienteForm, value: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: '#54585E' }}>{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(name, e.target.value)}
        className={inputClass}
        style={inputStyle}
        onFocus={e => (e.currentTarget.style.borderColor = '#5C894A')}
        onBlur={e => (e.currentTarget.style.borderColor = '#DFE0E5')}
      />
    </div>
  )
}

export default function IngresoPacientePage() {
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState('Ingresa Paciente')
  const [form, setForm] = useState<PacienteForm>(emptyForm)
  const [dniSearch, setDniSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pacienteId, setPacienteId] = useState<string | null>(null)

  function handleChange(name: keyof PacienteForm, value: string) {
    setForm(f => ({ ...f, [name]: value }))
    setError('')
  }

  async function handleSearchDNI() {
    if (!dniSearch.trim()) return
    setSearching(true)
    setError('')
    setSuccess('')
    setPacienteId(null)

    const { data, error } = await supabase
      .from('pacientes')
      .select('*')
      .eq('dni', dniSearch.trim())
      .single()

    setSearching(false)

    if (error || !data) {
      setForm({ ...emptyForm, dni: dniSearch.trim() })
      setError('Paciente no encontrado. Completá los datos para registrarlo.')
      return
    }

    setForm({
      dni: data.dni ?? '',
      nombre: data.nombre ?? '',
      apellido: data.apellido ?? '',
      fecha_nacimiento: data.fecha_nacimiento ?? '',
      sexo: data.sexo ?? '',
      telefono: data.telefono ?? '',
      email: data.email ?? '',
      obra_social: data.obra_social ?? '',
      historia_clinica: data.historia_clinica ?? '',
      observaciones: data.observaciones ?? '',
    })
    setPacienteId(data.id)
    setSuccess(`Paciente encontrado: ${data.nombre} ${data.apellido} (${data.paciente_codigo})`)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre || !form.apellido || !form.dni) {
      setError('Nombre, apellido y DNI son obligatorios.')
      return
    }

    setSaving(true)
    setError('')

    const payload = {
      dni: form.dni,
      nombre: form.nombre,
      apellido: form.apellido,
      fecha_nacimiento: form.fecha_nacimiento || null,
      sexo: form.sexo || null,
      telefono: form.telefono || null,
      email: form.email || null,
      obra_social: form.obra_social || null,
      historia_clinica: form.historia_clinica || null,
      observaciones: form.observaciones || null,
    }

    let id = pacienteId

    if (pacienteId) {
      // Actualizar paciente existente
      const { error } = await supabase
        .from('pacientes')
        .update(payload)
        .eq('id', pacienteId)
      if (error) { setError(error.message); setSaving(false); return }
    } else {
      // Crear nuevo paciente
      const { data, error } = await supabase
        .from('pacientes')
        .insert(payload)
        .select('id')
        .single()
      if (error) { setError(error.message); setSaving(false); return }
      id = data.id
      setPacienteId(id)
    }

    setSaving(false)
    setSuccess(pacienteId ? 'Paciente actualizado correctamente.' : 'Paciente registrado correctamente.')

    // Navegar a carga de muestra
    if (id) navigate(`/muestra/nueva?paciente_id=${id}`)
  }

  return (
    <div
      className="flex min-h-screen"
      style={{ background: 'linear-gradient(135deg, #EEF1F3, #E5EAED)' }}
    >
      <Sidebar active={activeSection} onSelect={setActiveSection} />

      <div className="flex flex-col flex-1">
        <TopBar name="Usuario" role="Cargo" />

        <main className="flex-1 p-10">
          <h1 className="text-2xl font-semibold mb-1" style={{ color: '#5C894A' }}>
            Ingresar Paciente
          </h1>
          <p className="text-sm mb-8" style={{ color: '#54585E' }}>
            Buscá por DNI para actualizar un paciente existente o completá los datos para registrar uno nuevo.
          </p>

          {/* Búsqueda por DNI */}
          <div
            className="rounded-2xl p-6 mb-6"
            style={{
              background: 'linear-gradient(160deg, #FBFBFC, #FAF9FB)',
              border: '1px solid #DFE0E5',
              boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
            }}
          >
            <p className="text-sm font-semibold mb-3" style={{ color: '#5C894A' }}>
              Buscar paciente existente
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ingresá el DNI..."
                value={dniSearch}
                onChange={e => setDniSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearchDNI()}
                className={inputClass}
                style={{ ...inputStyle, maxWidth: 280 }}
                onFocus={e => (e.currentTarget.style.borderColor = '#5C894A')}
                onBlur={e => (e.currentTarget.style.borderColor = '#DFE0E5')}
              />
              <button
                type="button"
                onClick={handleSearchDNI}
                disabled={searching}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer disabled:opacity-60"
                style={{
                  background: 'linear-gradient(180deg, #94BB66, #4A9151)',
                  border: '1px solid #56874A',
                  color: '#F1FAEF',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              >
                <Search size={15} />
                {searching ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </div>

          {/* Mensajes */}
          {error && (
            <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-lg text-sm" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#c0392b' }}>
              <AlertCircle size={15} /> {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-lg text-sm" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' }}>
              {success}
            </div>
          )}

          {/* Formulario */}
          <form onSubmit={handleSubmit}>
            <div
              className="rounded-2xl p-6"
              style={{
                background: 'linear-gradient(160deg, #FBFBFC, #FAF9FB)',
                border: '1px solid #DFE0E5',
                boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
              }}
            >
              <div className="flex items-center gap-2 mb-6">
                <UserPlus size={18} style={{ color: '#5C894A' }} />
                <p className="text-sm font-semibold" style={{ color: '#5C894A' }}>
                  {pacienteId ? 'Datos del paciente' : 'Registrar nuevo paciente'}
                </p>
              </div>

              {/* Grid de campos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                <FormInput label="DNI *"        name="dni"       value={form.dni}       onChange={handleChange} placeholder="12345678" />
                <FormInput label="Nombre *"     name="nombre"    value={form.nombre}    onChange={handleChange} />
                <FormInput label="Apellido *"   name="apellido"  value={form.apellido}  onChange={handleChange} />
                <FormInput label="Fecha de nacimiento" name="fecha_nacimiento" value={form.fecha_nacimiento} onChange={handleChange} type="date" />
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: '#54585E' }}>Sexo</label>
                  <select
                    value={form.sexo}
                    onChange={e => handleChange('sexo', e.target.value)}
                    className={inputClass}
                    style={inputStyle}
                    onFocus={e => (e.currentTarget.style.borderColor = '#5C894A')}
                    onBlur={e => (e.currentTarget.style.borderColor = '#DFE0E5')}
                  >
                    <option value="">Seleccionar...</option>
                    <option value="masculino">Masculino</option>
                    <option value="femenino">Femenino</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <FormInput label="Teléfono"     name="telefono"        value={form.telefono}        onChange={handleChange} placeholder="+54 9 11 ..." />
                <FormInput label="Email"        name="email"           value={form.email}           onChange={handleChange} type="email" />
                <FormInput label="Obra social"  name="obra_social"     value={form.obra_social}     onChange={handleChange} />
                <FormInput label="Historia clínica" name="historia_clinica" value={form.historia_clinica} onChange={handleChange} />
              </div>

              <div className="flex flex-col gap-1 mb-6">
                <label className="text-xs font-medium" style={{ color: '#54585E' }}>Observaciones</label>
                <textarea
                  value={form.observaciones}
                  onChange={e => handleChange('observaciones', e.target.value)}
                  rows={3}
                  className={inputClass}
                  style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderColor = '#5C894A')}
                  onBlur={e => (e.currentTarget.style.borderColor = '#DFE0E5')}
                />
              </div>

              {/* Acciones */}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer disabled:opacity-60"
                  style={{
                    background: 'linear-gradient(180deg, #94BB66, #4A9151)',
                    border: '1px solid #56874A',
                    color: '#F1FAEF',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'linear-gradient(180deg, #a3c977, #3d7d44)'
                    e.currentTarget.style.boxShadow = '0 3px 8px rgba(0,0,0,0.3)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'linear-gradient(180deg, #94BB66, #4A9151)'
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.25)'
                  }}
                >
                  {saving ? 'Guardando...' : pacienteId ? 'Actualizar y continuar' : 'Registrar y continuar'}
                  {!saving && <ChevronRight size={16} />}
                </button>
              </div>
            </div>
          </form>
        </main>
      </div>
    </div>
  )
}
