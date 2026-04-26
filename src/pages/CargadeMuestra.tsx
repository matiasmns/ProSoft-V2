import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ReactCrop, { type PercentCrop, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { AlertCircle, ChevronRight, CropIcon, ImageIcon, ImageUp, ScanSearch, X } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import TopBar from '../components/TopBar'
import { supabase } from '../lib/supabase'
import { ANALYSIS_API_ENABLED } from '../lib/backendProcessor'
import {
  buildResultadoCrudo,
  DENSITOGRAM_FILE_ACCEPT,
  emptyCropSettings,
  normalizeCropSettings,
  removeAnalisisImages,
  resolveDensitogramFileSupport,
  type CropSettings,
  uploadAnalisisImage,
} from '../lib/electroforesis'

type ImageFile = {
  file: File
  preview: string
  tipo: string
  crop: CropSettings
  dimensions: { width: number; height: number } | null
  storagePath?: string
}

type CropSummary = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
  areaCoverage: number
}

type ImageDimensions = {
  width: number
  height: number
}

const FIXED_IMAGE_TYPE = 'densitograma'

const thumbButtonStyle = {
  border: '1px solid #DFE0E5',
  background: '#FFFFFF',
  color: '#54585E',
}

function parseCropValue(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function toPixelCrop(crop: CropSettings): PixelCrop | undefined {
  const x = parseCropValue(crop.izquierda)
  const y = parseCropValue(crop.arriba)
  const width = parseCropValue(crop.ancho)
  const height = parseCropValue(crop.alto)

  if (x == null || y == null || width == null || height == null || width <= 0 || height <= 0) {
    return undefined
  }

  return {
    unit: 'px',
    x,
    y,
    width,
    height,
  }
}

function toPercentCrop(crop: CropSettings, dimensions: ImageDimensions | null): PercentCrop | undefined {
  if (!dimensions) return undefined

  const pixelCrop = toPixelCrop(crop)
  if (!pixelCrop) return undefined

  return {
    unit: '%',
    x: (pixelCrop.x * 100) / dimensions.width,
    y: (pixelCrop.y * 100) / dimensions.height,
    width: (pixelCrop.width * 100) / dimensions.width,
    height: (pixelCrop.height * 100) / dimensions.height,
  }
}

function cropToSettings(crop: PercentCrop | undefined, dimensions: ImageDimensions | null): CropSettings {
  if (!crop || !dimensions || crop.width < 0.1 || crop.height < 0.1) {
    return {
      ...emptyCropSettings,
      separacion: '',
    }
  }

  return {
    izquierda: Math.round((crop.x * dimensions.width) / 100).toString(),
    arriba: Math.round((crop.y * dimensions.height) / 100).toString(),
    ancho: Math.round((crop.width * dimensions.width) / 100).toString(),
    alto: Math.round((crop.height * dimensions.height) / 100).toString(),
    separacion: '',
  }
}

function formatStat(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2)
}

function buildCropSummary(image: ImageFile | null): CropSummary | null {
  if (!image?.dimensions) return null

  const crop = toPixelCrop(image.crop)
  if (!crop) return null

  const left = Math.max(0, crop.x)
  const top = Math.max(0, crop.y)
  const width = Math.min(crop.width, image.dimensions.width - left)
  const height = Math.min(crop.height, image.dimensions.height - top)
  const right = Math.max(0, image.dimensions.width - (left + width))
  const bottom = Math.max(0, image.dimensions.height - (top + height))
  const areaCoverage = image.dimensions.width > 0 && image.dimensions.height > 0
    ? (width * height * 100) / (image.dimensions.width * image.dimensions.height)
    : 0

  return {
    left,
    top,
    right,
    bottom,
    width,
    height,
    areaCoverage,
  }
}

function CropPreview({ image, crop }: { image: ImageFile; crop: PixelCrop }) {
  if (!image.dimensions || crop.width <= 0 || crop.height <= 0) return null

  const maxWidth = 260
  const maxHeight = 170
  const scale = Math.min(maxWidth / crop.width, maxHeight / crop.height)
  const previewWidth = image.dimensions.width * scale
  const previewHeight = image.dimensions.height * scale

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#F6F7F8', border: '1px solid #DFE0E5' }}>
      <div className="px-3 py-2 text-xs font-semibold" style={{ color: '#5C894A', borderBottom: '1px solid #DFE0E5' }}>
        Vista del recorte
      </div>
      <div className="p-3 flex items-center justify-center">
        <div
          className="overflow-hidden rounded-lg"
          style={{
            width: crop.width * scale,
            height: crop.height * scale,
            maxWidth,
            maxHeight,
            border: '1px solid #DFE0E5',
            background: '#FFFFFF',
          }}
        >
          <img
            src={image.preview}
            alt={`${image.file.name} recorte`}
            style={{
              width: previewWidth,
              height: previewHeight,
              maxWidth: 'none',
              transform: `translate(-${crop.x * scale}px, -${crop.y * scale}px)`,
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default function CargadeMuestra() {
  const [searchParams] = useSearchParams()
  const pacienteId = searchParams.get('paciente_id') ?? ''
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState('Ingresa Paciente')

  const [images, setImages] = useState<ImageFile[]>([])
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const selectedImage = selectedImageIndex != null ? images[selectedImageIndex] ?? null : null
  const selectedPercentCrop = selectedImage ? toPercentCrop(selectedImage.crop, selectedImage.dimensions) : undefined
  const selectedCrop = selectedImage ? toPixelCrop(selectedImage.crop) : undefined
  const selectedSummary = buildCropSummary(selectedImage)

  function addFiles(files: FileList | null) {
    if (!files) return

    const nextFiles = Array.from(files)
    const supportedFiles = nextFiles.flatMap(file => {
      const support = resolveDensitogramFileSupport(file.name, file.type)
      if (!support.accepted) return []
      if (support.requiresBackend && !ANALYSIS_API_ENABLED) return []

      return [{
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
        tipo: FIXED_IMAGE_TYPE,
        crop: { ...emptyCropSettings },
        dimensions: null,
      }]
    })

    const rejectedMessages = nextFiles.flatMap(file => {
      const support = resolveDensitogramFileSupport(file.name, file.type)
      if (!support.accepted) {
        return [`${file.name}: ${support.reason ?? 'Formato no compatible.'}`]
      }

      if (support.requiresBackend && !ANALYSIS_API_ENABLED) {
        return [`${file.name}: ${support.reason ?? 'Este formato requiere backend.'}`]
      }

      return []
    })

    if (supportedFiles.length === 0) {
      setError(rejectedMessages.join(' '))
      return
    }

    const baseIndex = images.length
    setError(rejectedMessages.join(' '))
    setImages(prev => [...prev, ...supportedFiles])
    setSelectedImageIndex(current => current ?? baseIndex)
  }

  function removeImage(index: number) {
    setImages(prev => {
      const selected = prev[index]
      if (selected?.preview) URL.revokeObjectURL(selected.preview)
      return prev.filter((_, currentIndex) => currentIndex !== index)
    })

    setSelectedImageIndex(current => {
      if (current == null) return null
      if (images.length === 1) return null
      if (current === index) return current === images.length - 1 ? current - 1 : current
      return current > index ? current - 1 : current
    })
  }

  function updateCrop(index: number, key: keyof CropSettings, value: string) {
    setImages(prev => prev.map((image, currentIndex) => (
      currentIndex === index
        ? { ...image, crop: { ...image.crop, [key]: value } }
        : image
    )))
  }

  function updateCropFromEditor(index: number, percentCrop: PercentCrop) {
    setImages(prev => prev.map((image, currentIndex) => {
      if (currentIndex !== index) return image

      const nextCrop = cropToSettings(percentCrop, image.dimensions)
      return {
        ...image,
        crop: {
          ...image.crop,
          ...nextCrop,
          separacion: image.crop.separacion,
        },
      }
    }))
  }

  function setImageDimensions(index: number, width: number, height: number) {
    setImages(prev => prev.map((image, currentIndex) => (
      currentIndex === index && (!image.dimensions || image.dimensions.width !== width || image.dimensions.height !== height)
        ? { ...image, dimensions: { width, height } }
        : image
    )))
  }

  function setFullImageCrop(index: number) {
    const image = images[index]
    if (!image?.dimensions) return

    setImages(prev => prev.map((currentImage, currentIndex) => (
      currentIndex === index
        ? {
            ...currentImage,
            crop: {
              ...currentImage.crop,
              izquierda: '0',
              arriba: '0',
              ancho: currentImage.dimensions?.width.toString() ?? '',
              alto: currentImage.dimensions?.height.toString() ?? '',
            },
          }
        : currentImage
    )))
  }

  function clearEditorCrop(index: number) {
    setImages(prev => prev.map((image, currentIndex) => (
      currentIndex === index
        ? {
            ...image,
            crop: {
              ...emptyCropSettings,
              separacion: image.crop.separacion,
            },
          }
        : image
    )))
  }

  async function handleContinuar() {
    if (!pacienteId) {
      setError('No se encontro el paciente asociado a esta muestra.')
      return
    }

    if (images.length === 0) {
      setError('Carga al menos una imagen antes de continuar.')
      return
    }

    setSaving(true)
    setError('')

    let analisisId: string | null = null
    const uploadedImages: Array<ImageFile & { storagePath: string }> = []

    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: analisis, error: insertError } = await supabase
        .from('analisis_electroforesis')
        .insert({
          paciente_id: pacienteId,
          estado: 'pendiente',
          created_by: user?.id ?? null,
          resultado_crudo: buildResultadoCrudo(
            images.map(image => ({
              nombre: image.file.name,
              tipo: image.tipo,
              crop: image.crop,
            })),
          ),
        })
        .select('id')
        .single()

      if (insertError || !analisis) {
        throw new Error(insertError?.message ?? 'No se pudo crear el analisis pendiente.')
      }

      const currentAnalisisId = analisis.id
      analisisId = currentAnalisisId

      for (const image of images) {
        const storagePath = await uploadAnalisisImage(currentAnalisisId, image.file)
        uploadedImages.push({ ...image, storagePath })
      }

      const { error: imagesError } = await supabase
        .from('analisis_imagenes')
        .insert(
          uploadedImages.map(image => ({
            analisis_id: currentAnalisisId,
            tipo: image.tipo,
            url: image.storagePath,
            nombre_archivo: image.file.name,
          })),
        )

      if (imagesError) {
        throw new Error(imagesError.message)
      }

      const densitogramaPrincipal = uploadedImages.find(image => image.tipo === 'densitograma')

      const { error: updateError } = await supabase
        .from('analisis_electroforesis')
        .update({
          archivo_densitograma_url: densitogramaPrincipal?.storagePath ?? null,
          resultado_crudo: buildResultadoCrudo(
            uploadedImages.map(image => ({
              nombre: image.file.name,
              tipo: image.tipo,
              crop: image.crop,
              storagePath: image.storagePath,
            })),
            {
              last_step: 'sample_uploaded',
            },
          ),
        })
        .eq('id', currentAnalisisId)

      if (updateError) {
        throw new Error(updateError.message)
      }

      navigate(`/analisis/nuevo?paciente_id=${pacienteId}&analisis_id=${currentAnalisisId}`, {
        state: {
          images: uploadedImages.map(image => ({
            preview: image.preview,
            tipo: image.tipo,
            nombre: image.file.name,
            storagePath: image.storagePath,
            crop: normalizeCropSettings(image.crop),
          })),
        },
      })
    } catch (caughtError) {
      let cleanupError = ''

      if (analisisId) {
        const cleanupErrors: string[] = []
        let storageCleanupFailed = false

        if (uploadedImages.length > 0) {
          const { error: deleteRowsError } = await supabase
            .from('analisis_imagenes')
            .delete()
            .eq('analisis_id', analisisId)

          if (deleteRowsError) {
            cleanupErrors.push(`No se pudieron limpiar las filas de imagenes: ${deleteRowsError.message}`)
          }

          try {
            await removeAnalisisImages(uploadedImages.map(image => image.storagePath))
          } catch (storageCleanupError) {
            storageCleanupFailed = true
            cleanupErrors.push(
              storageCleanupError instanceof Error
                ? `No se pudieron limpiar los archivos cargados: ${storageCleanupError.message}`
                : 'No se pudieron limpiar los archivos cargados.',
            )
          }
        }

        cleanupError = cleanupErrors.join(' ')
        const persistUploadedPaths = storageCleanupFailed
        const failedImages = persistUploadedPaths ? uploadedImages : images

        await supabase
          .from('analisis_electroforesis')
          .update({
            archivo_densitograma_url: null,
            resultado_crudo: buildResultadoCrudo(
              failedImages.map(image => ({
                nombre: image.file.name,
                tipo: image.tipo,
                crop: image.crop,
                storagePath: 'storagePath' in image ? image.storagePath : undefined,
              })),
              {
                processor_status: 'failed',
                last_step: 'sample_upload_failed',
                cleanup_error: cleanupError || null,
              },
            ),
          })
          .eq('id', analisisId)
      }

      const baseMessage = caughtError instanceof Error ? caughtError.message : 'No se pudo guardar la muestra.'
      setError(cleanupError ? `${baseMessage} ${cleanupError}` : baseMessage)
    } finally {
      setSaving(false)
    }
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
          <div className="flex items-center gap-2 mb-1">
            <ImageUp size={22} style={{ color: '#5C894A' }} />
            <h1 className="text-2xl font-semibold" style={{ color: '#5C894A' }}>
              Carga de Muestra
            </h1>
          </div>
          <p className="text-sm mb-8" style={{ color: '#54585E' }}>
            Carga las imagenes del estudio y define los parametros iniciales de recorte con una mascara visual antes de continuar.
          </p>

          {error && (
            <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-lg text-sm" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#c0392b' }}>
              <AlertCircle size={15} /> {error}
            </div>
          )}

          <div
            className="rounded-2xl p-8 mb-6"
            style={{
              background: 'linear-gradient(160deg, #FBFBFC, #FAF9FB)',
              border: '1px solid #DFE0E5',
              boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
            }}
          >
            <div
              className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-150"
              style={{ borderColor: dragging ? '#4A9151' : '#DFE0E5', background: dragging ? 'rgba(92,137,74,0.04)' : 'transparent' }}
              onClick={() => fileRef.current?.click()}
              onDragOver={event => { event.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={event => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files) }}
            >
              <div
                className="flex items-center justify-center w-16 h-16 rounded-2xl mx-auto mb-4"
                style={{ background: 'rgba(92,137,74,0.1)' }}
              >
                <ImageUp size={30} style={{ color: '#5C894A' }} />
              </div>
              <p className="text-sm font-semibold mb-1" style={{ color: '#54585E' }}>
                Arrastra las imagenes aqui
              </p>
              <p className="text-xs mb-4" style={{ color: '#94BB66' }}>
                o hace click para seleccionar archivos
              </p>
              <button
                type="button"
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer"
                style={{
                  background: 'linear-gradient(180deg, #94BB66, #4A9151)',
                  border: '1px solid #56874A',
                  color: '#F1FAEF',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
                onMouseEnter={event => {
                  event.currentTarget.style.background = 'linear-gradient(180deg, #a3c977, #3d7d44)'
                  event.currentTarget.style.boxShadow = '0 3px 8px rgba(0,0,0,0.3)'
                }}
                onMouseLeave={event => {
                  event.currentTarget.style.background = 'linear-gradient(180deg, #94BB66, #4A9151)'
                  event.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)'
                }}
              >
                <ImageUp size={15} />
                Cargar imagen
              </button>
              <p className="text-xs mt-3" style={{ color: '#DFE0E5' }}>
                PNG, JPG, TIFF, PDF
              </p>
              <input
                ref={fileRef}
                type="file"
                accept={DENSITOGRAM_FILE_ACCEPT}
                multiple
                className="hidden"
                onChange={event => addFiles(event.target.files)}
              />
            </div>

            {images.length > 0 && (
              <div className="mt-6 flex flex-col gap-6">
                <div>
                  <p className="text-xs font-medium mb-3" style={{ color: '#5C894A' }}>
                    {images.length} {images.length === 1 ? 'imagen cargada' : 'imagenes cargadas'}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {images.map((image, index) => {
                      const isSelected = selectedImageIndex === index
                      return (
                        <div
                          key={`${image.file.name}-${index}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedImageIndex(index)}
                          onKeyDown={event => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              setSelectedImageIndex(index)
                            }
                          }}
                          className="relative rounded-xl overflow-hidden text-left transition"
                          style={isSelected
                            ? { ...thumbButtonStyle, border: '1px solid #5C894A', boxShadow: '0 0 0 2px rgba(92,137,74,0.18)' }
                            : thumbButtonStyle}
                        >
                          {image.preview ? (
                            <img src={image.preview} alt={image.file.name} className="w-full h-32 object-cover" />
                          ) : (
                            <div
                              className="w-full h-32 flex flex-col items-center justify-center gap-1 px-2"
                              style={{ background: '#f4f3ec' }}
                            >
                              <ImageIcon size={20} style={{ color: '#94BB66' }} />
                              <p className="text-xs text-center truncate w-full" style={{ color: '#54585E' }}>
                                {image.file.name}
                              </p>
                            </div>
                          )}

                          <div className="px-2 py-2" style={{ background: '#FBFBFC', borderTop: '1px solid #DFE0E5' }}>
                            <p className="text-xs font-semibold truncate" style={{ color: '#54585E' }}>
                              {image.file.name}
                            </p>
                            <p className="text-[11px] mt-1" style={{ color: '#94BB66' }}>
                              {isSelected ? 'Editor activo' : 'Click para editar'}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={event => {
                              event.stopPropagation()
                              removeImage(index)
                            }}
                            className="absolute top-1.5 right-1.5 flex items-center justify-center w-5 h-5 rounded-full cursor-pointer"
                            style={{ background: 'rgba(0,0,0,0.55)' }}
                          >
                            <X size={11} color="white" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {selectedImage && (
                  <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_380px] gap-5">
                    <section
                      className="rounded-2xl p-5"
                      style={{ background: '#FFFFFF', border: '1px solid #DFE0E5' }}
                    >
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <div>
                          <p className="text-sm font-semibold" style={{ color: '#5C894A' }}>
                            Editor de mascara
                          </p>
                          <p className="text-xs mt-1" style={{ color: '#54585E' }}>
                            Seleccion activa: {selectedImage.file.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => clearEditorCrop(selectedImageIndex ?? 0)}
                            className="rounded-lg px-3 py-2 text-xs font-medium cursor-pointer transition"
                            style={{ color: '#54585E', border: '1px solid #DFE0E5', background: '#FBFBFC' }}
                          >
                            Limpiar
                          </button>
                          <button
                            type="button"
                            onClick={() => setFullImageCrop(selectedImageIndex ?? 0)}
                            disabled={!selectedImage.dimensions}
                            className="rounded-lg px-3 py-2 text-xs font-medium cursor-pointer transition disabled:opacity-60"
                            style={{ color: '#54585E', border: '1px solid #DFE0E5', background: '#FBFBFC' }}
                          >
                            Imagen completa
                          </button>
                        </div>
                      </div>

                      {selectedImage.preview ? (
                        <div className="rounded-2xl p-4" style={{ background: '#F6F7F8', border: '1px solid #DFE0E5' }}>
                          <ReactCrop
                            crop={selectedPercentCrop}
                            keepSelection
                            minWidth={40}
                            minHeight={40}
                            ruleOfThirds
                            onChange={(_, percentCrop) => updateCropFromEditor(selectedImageIndex ?? 0, percentCrop)}
                          >
                            <img
                              src={selectedImage.preview}
                              alt={selectedImage.file.name}
                              className="max-h-[560px] w-auto max-w-full rounded-xl"
                              onLoad={event => setImageDimensions(
                                selectedImageIndex ?? 0,
                                event.currentTarget.naturalWidth,
                                event.currentTarget.naturalHeight,
                              )}
                            />
                          </ReactCrop>
                        </div>
                      ) : (
                        <div className="rounded-2xl p-6" style={{ background: '#F6F7F8', border: '1px solid #DFE0E5' }}>
                          <p className="text-sm font-semibold" style={{ color: '#54585E' }}>
                            Editor no disponible para este archivo
                          </p>
                          <p className="text-xs mt-2" style={{ color: '#94BB66' }}>
                            El recorte interactivo solo se habilita para imagenes raster. Para PDF u otros formatos segui usando los campos manuales.
                          </p>
                        </div>
                      )}
                    </section>

                    <section className="flex flex-col gap-4">
                      <div
                        className="rounded-2xl p-5"
                        style={{ background: 'linear-gradient(160deg, #FBFBFC, #FAF9FB)', border: '1px solid #DFE0E5' }}
                      >
                        <div className="flex items-center gap-2 mb-4">
                          <ScanSearch size={18} style={{ color: '#5C894A' }} />
                          <p className="text-sm font-semibold" style={{ color: '#5C894A' }}>
                            Analisis del area
                          </p>
                        </div>

                        {selectedSummary ? (
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              ['Margen izq.', `${formatStat(selectedSummary.left)} px`],
                              ['Margen sup.', `${formatStat(selectedSummary.top)} px`],
                              ['Margen der.', `${formatStat(selectedSummary.right)} px`],
                              ['Margen inf.', `${formatStat(selectedSummary.bottom)} px`],
                              ['Ancho ROI', `${formatStat(selectedSummary.width)} px`],
                              ['Alto ROI', `${formatStat(selectedSummary.height)} px`],
                              ['Cobertura', `${selectedSummary.areaCoverage.toFixed(2)} %`],
                            ].map(([label, value]) => (
                              <div key={label} className="rounded-xl px-3 py-2" style={{ background: '#FFFFFF', border: '1px solid #DFE0E5' }}>
                                <p className="text-[11px]" style={{ color: '#54585E' }}>{label}</p>
                                <p className="text-sm font-semibold mt-1" style={{ color: '#5C894A' }}>{value}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs" style={{ color: '#54585E' }}>
                            Dibuja una mascara sobre la imagen para calcular margenes y area util de analisis.
                          </p>
                        )}
                      </div>

                      {selectedImage.preview && selectedCrop && <CropPreview image={selectedImage} crop={selectedCrop} />}

                      <div
                        className="rounded-2xl p-5"
                        style={{ background: 'linear-gradient(160deg, #FBFBFC, #FAF9FB)', border: '1px solid #DFE0E5' }}
                      >
                        <div className="flex items-center gap-2 mb-4">
                          <CropIcon size={18} style={{ color: '#5C894A' }} />
                          <p className="text-sm font-semibold" style={{ color: '#5C894A' }}>
                            Parametros guardados
                          </p>
                        </div>

                        <div className="mb-3">
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px]" style={{ color: '#54585E' }}>Tipo de imagen</span>
                            <input
                              value="Densitograma"
                              readOnly
                              className="w-full text-xs rounded-lg px-3 py-2 outline-none"
                              style={{ border: '1px solid #DFE0E5', color: '#54585E', background: '#F4F5F7' }}
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {([
                            ['izquierda', 'Izq.'],
                            ['arriba', 'Arriba'],
                            ['ancho', 'Ancho'],
                            ['alto', 'Alto'],
                            ['separacion', 'Separacion'],
                          ] as Array<[keyof CropSettings, string]>).map(([key, label]) => (
                            <label key={key} className={`flex flex-col gap-1 ${key === 'separacion' ? 'col-span-2' : ''}`}>
                              <span className="text-[11px]" style={{ color: '#54585E' }}>{label}</span>
                              <input
                                type="number"
                                step="1"
                                value={selectedImage.crop[key]}
                                onChange={event => updateCrop(selectedImageIndex ?? 0, key, event.target.value)}
                                className="w-full rounded-lg px-3 py-2 text-xs outline-none"
                                style={{ border: '1px solid #DFE0E5', color: '#54585E', background: '#fff' }}
                              />
                            </label>
                          ))}
                        </div>
                        <p className="text-[11px] mt-3" style={{ color: '#94BB66' }}>
                          El editor actualiza estos valores y se guardan como parametros iniciales para el procesador.
                        </p>
                      </div>
                    </section>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition"
              style={{ color: '#54585E', border: '1px solid #DFE0E5', background: '#FBFBFC' }}
            >
              Volver
            </button>

            <button
              type="button"
              onClick={handleContinuar}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer disabled:opacity-60"
              style={{
                background: 'linear-gradient(180deg, #94BB66, #4A9151)',
                border: '1px solid #56874A',
                color: '#F1FAEF',
                boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
              }}
              onMouseEnter={event => {
                event.currentTarget.style.background = 'linear-gradient(180deg, #a3c977, #3d7d44)'
                event.currentTarget.style.boxShadow = '0 3px 8px rgba(0,0,0,0.3)'
              }}
              onMouseLeave={event => {
                event.currentTarget.style.background = 'linear-gradient(180deg, #94BB66, #4A9151)'
                event.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.25)'
              }}
            >
              {saving ? 'Guardando muestra...' : 'Continuar'}
              {!saving && <ChevronRight size={16} />}
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}
