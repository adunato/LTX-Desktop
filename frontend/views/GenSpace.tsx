import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Trash2, Image, Video, X,
  Heart, Film, Sparkles, Sliders,
  Clock, Monitor, ChevronUp, Scissors, Music,
  ChevronLeft, ChevronRight, Copy, Check, Loader2
} from 'lucide-react'
import { useProjects } from '../contexts/ProjectContext'
import type { GenSpaceRetakeSource } from '../contexts/ProjectContext'
import { useAppSettings } from '../contexts/AppSettingsContext'
import { useGeneration } from '../hooks/use-generation'
import { backendFetch } from '../lib/backend'
import { useRetake } from '../hooks/use-retake'
import { useIcLora } from '../hooks/use-ic-lora'
import type { ICLoraConditioningType } from '../components/ICLoraPanel'
import type { Asset } from '../types/project'
import { GenerationErrorDialog } from '../components/GenerationErrorDialog'
import { fileUrlToPath } from '../lib/url-to-path'
import {
  FORCED_API_VIDEO_FPS,
  FORCED_API_VIDEO_RESOLUTIONS,
  getAllowedForcedApiDurations,
  sanitizeForcedApiVideoSettings,
} from '../lib/api-video-options'
import { RetakePanel } from '../components/RetakePanel'
import { ICLoraPanel, CONDITIONING_TYPES } from '../components/ICLoraPanel'
import { FreeApiKeyBubble } from '../components/FreeApiKeyBubble'

export interface ProxyWidget {
  node: string
  field: string
}

export interface ComfyUIWorkflow {
  id: string
  name: string
  pipeline: string
  ui_mapping: Record<string, ProxyWidget>
  is_healthy: boolean
}

// Asset card with hover overlays
function AssetCard({
  asset,
  isSelected,
  onSelect,
  onDelete,
  onToggleFavorite,
  onPlay,
  onDragStart,
  size,
}: {
  asset: Asset
  isSelected: boolean
  onSelect: (asset: Asset) => void
  onDelete: (id: string) => void
  onToggleFavorite: (id: string) => void
  onPlay: (asset: Asset) => void
  onDragStart: (e: React.DragEvent, asset: Asset) => void
  size: GallerySize
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseEnter = () => {
    setIsHovered(true)
    if (asset.type === 'video' && videoRef.current) {
      videoRef.current.currentTime = 0
      void videoRef.current.play()
    }
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
    if (asset.type === 'video' && videoRef.current) {
      videoRef.current.pause()
    }
  }

  return (
    <div
      className={`relative group rounded-xl overflow-hidden bg-zinc-900 border-2 transition-all cursor-pointer ${
        isSelected ? 'border-blue-500' : 'border-transparent hover:border-zinc-700'
      } ${size === 'small' ? 'aspect-square' : 'aspect-video'}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => onSelect(asset)}
      draggable={asset.type === 'image'}
      onDragStart={(e) => asset.type === 'image' && onDragStart(e, asset)}
    >
      {asset.type === 'video' ? (
        <video 
          ref={videoRef}
          src={asset.url} 
          muted 
          loop 
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <img 
          src={asset.url} 
          alt="" 
          className="w-full h-full object-cover"
        />
      )}

      {/* Hover Overlays */}
      <div className={`absolute inset-0 bg-black/40 transition-opacity flex flex-col justify-between p-2 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
        <div className="flex justify-end gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(asset.id) }}
            className={`p-1.5 rounded-lg backdrop-blur-md transition-colors ${
              asset.favorite ? 'bg-blue-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Heart className={`h-3.5 w-3.5 ${asset.favorite ? 'fill-current' : ''}`} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(asset.id) }}
            className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-red-500/80 backdrop-blur-md transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex justify-between items-end">
          <div className="flex flex-col">
            <span className="text-[10px] text-white/70 font-medium px-1.5 py-0.5 rounded-md bg-black/40 backdrop-blur-sm w-fit">
              {asset.type === 'video' ? (asset.duration ? `${asset.duration}s` : 'Video') : 'Image'}
            </span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onPlay(asset) }}
            className="p-2 rounded-full bg-white text-black hover:scale-110 transition-transform shadow-lg"
          >
            <Video className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function SettingsDropdown({
  title,
  value,
  onChange,
  options,
  trigger,
  className,
}: {
  title: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; icon?: React.ReactNode; disabled?: boolean; tooltip?: string }[]
  trigger: React.ReactNode
  className?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-zinc-800 transition-colors"
      >
        {trigger}
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 left-0 w-48 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-1">
          <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-800/50">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{title}</span>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {options.map((opt) => (
              <button
                key={opt.value}
                disabled={opt.disabled}
                onClick={() => {
                  onChange(opt.value)
                  setIsOpen(false)
                }}
                title={opt.tooltip}
                className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-2 ${
                  opt.disabled ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:bg-zinc-800'
                } ${value === opt.value ? 'text-blue-400 bg-blue-500/5' : 'text-zinc-300'}`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ZitIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  )
}

function LightricksIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" />
    </svg>
  )
}

function AspectIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 3v18" />
    </svg>
  )
}

function GridSmallIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="2" y="2" width="4" height="4" rx="0.5" />
      <rect x="8" y="2" width="4" height="4" rx="0.5" />
      <rect x="14" y="2" width="4" height="4" rx="0.5" />
      <rect x="20" y="2" width="2" height="4" rx="0.5" />
      <rect x="2" y="8" width="4" height="4" rx="0.5" />
      <rect x="8" y="8" width="4" height="4" rx="0.5" />
      <rect x="14" y="8" width="4" height="4" rx="0.5" />
      <rect x="20" y="8" width="2" height="4" rx="0.5" />
      <rect x="2" y="14" width="4" height="4" rx="0.5" />
      <rect x="8" y="14" width="4" height="4" rx="0.5" />
      <rect x="14" y="14" width="4" height="4" rx="0.5" />
      <rect x="20" y="14" width="2" height="4" rx="0.5" />
    </svg>
  )
}

function GridMediumIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="2" y="2" width="6" height="6" rx="1" />
      <rect x="10" y="2" width="6" height="6" rx="1" />
      <rect x="18" y="2" width="4" height="6" rx="1" />
      <rect x="2" y="10" width="6" height="6" rx="1" />
      <rect x="10" y="10" width="6" height="6" rx="1" />
      <rect x="18" y="10" width="4" height="6" rx="1" />
      <rect x="2" y="18" width="6" height="4" rx="1" />
      <rect x="10" y="18" width="6" height="4" rx="1" />
      <rect x="18" y="18" width="4" height="4" rx="1" />
    </svg>
  )
}

function GridLargeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="2" y="2" width="9" height="9" rx="1.5" />
      <rect x="13" y="2" width="9" height="9" rx="1.5" />
      <rect x="2" y="13" width="9" height="9" rx="1.5" />
      <rect x="13" y="13" width="9" height="9" rx="1.5" />
    </svg>
  )
}

type GallerySize = 'small' | 'medium' | 'large'

const gallerySizeClasses: Record<GallerySize, string> = {
  small: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7',
  medium: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5',
  large: 'grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3',
}

const DEFAULT_VIDEO_SETTINGS = {
  model: 'fast',
  duration: 5,
  videoResolution: '540p',
  fps: 24,
  aspectRatio: '16:9',
  imageResolution: '1080p',
  variations: 1,
  audio: true,
}

function PromptBar({
  mode,
  onModeChange,
  canUseIcLora,
  prompt,
  onPromptChange,
  onGenerate,
  isGenerating,
  inputImage,
  onInputImageChange,
  inputAudio,
  onInputAudioChange,
  settings,
  onSettingsChange,
  shouldVideoGenerateWithLtxApi,
  canGenerate,
  buttonLabel,
  buttonIcon,
  icLoraCondType,
  onIcLoraCondTypeChange,
  icLoraStrength,
  onIcLoraStrengthChange,
  selectedWorkflowId,
  onWorkflowSelect,
  comfyWorkflows,
}: {
  mode: 'image' | 'video' | 'retake' | 'ic-lora'
  onModeChange: (mode: 'image' | 'video' | 'retake' | 'ic-lora') => void
  canUseIcLora: boolean
  prompt: string
  onPromptChange: (prompt: string) => void
  onGenerate: () => void
  isGenerating: boolean
  canGenerate: boolean
  buttonLabel: string
  buttonIcon: React.ReactNode
  inputImage: string | null
  onInputImageChange: (url: string | null) => void
  inputAudio: string | null
  onInputAudioChange: (url: string | null) => void
  settings: {
    model: string
    duration: number
    videoResolution: string
    fps: number
    aspectRatio: string
    imageResolution: string
    variations: number
    audio?: boolean
  }
  onSettingsChange: (settings: any) => void
  shouldVideoGenerateWithLtxApi: boolean
  icLoraCondType?: ICLoraConditioningType
  onIcLoraCondTypeChange?: (type: ICLoraConditioningType) => void
  icLoraStrength?: number
  onIcLoraStrengthChange?: (strength: number) => void
  selectedWorkflowId: string | null
  onWorkflowSelect: (id: string | null) => void
  comfyWorkflows: ComfyUIWorkflow[]
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isAudioDragOver, setIsAudioDragOver] = useState(false)
  const isRetake = mode === 'retake'
  const isIcLora = mode === 'ic-lora'
  
  const LOCAL_MAX_DURATION: Record<string, number> = { '540p': 20, '720p': 10, '1080p': 5 }
  const localMaxDuration = LOCAL_MAX_DURATION[settings.videoResolution] ?? 20
  const videoDurationOptions = shouldVideoGenerateWithLtxApi
    ? [...getAllowedForcedApiDurations(settings.model, settings.videoResolution, settings.fps)]
    : [5, 6, 8, 10, 20].filter(d => d <= localMaxDuration)
  const videoResolutionOptions = shouldVideoGenerateWithLtxApi
    ? (inputAudio ? ['1080p'] : [...FORCED_API_VIDEO_RESOLUTIONS])
    : ['540p', '720p', '1080p']
  const videoFpsOptions = shouldVideoGenerateWithLtxApi ? [...FORCED_API_VIDEO_FPS] : [24, 25, 50]

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const assetData = e.dataTransfer.getData('asset')
    if (assetData) {
      const asset = JSON.parse(assetData) as Asset
      if (asset.type === 'image') {
        onInputImageChange(asset.url)
      }
    }
  }

  const handleAudioDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsAudioDragOver(false)

    const assetData = e.dataTransfer.getData('asset')
    if (assetData) {
      const asset = JSON.parse(assetData) as Asset
      if (asset.type === 'audio') {
        onInputAudioChange(asset.url)
      }
    }

    // Handle file drops
    const file = e.dataTransfer.files?.[0]
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'].includes(ext || '')) {
        const filePath = (file as any).path as string | undefined
        if (filePath) {
          const normalized = filePath.replace(/\\/g, '/')
          const fileUrl = normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
          onInputAudioChange(fileUrl)
        }
      }
    }
  }

  const handleAudioFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const filePath = (file as any).path as string | undefined
      if (filePath) {
        const normalized = filePath.replace(/\\/g, '/')
        const fileUrl = normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
        onInputAudioChange(fileUrl)
      }
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      // In Electron, File objects have a .path property with the full filesystem path
      const filePath = (file as any).path as string | undefined
      if (filePath) {
        const normalized = filePath.replace(/\\/g, '/')
        const fileUrl = normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
        onInputImageChange(fileUrl)
      } else {
        const url = URL.createObjectURL(file)
        onInputImageChange(url)
      }
    }
  }
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isGenerating && canGenerate) {
      e.preventDefault()
      onGenerate()
    }
  }

  const selectedWorkflow = comfyWorkflows.find(w => w.id === selectedWorkflowId)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-visible">
      {/* Top row: Image ref | Prompt | Generate */}
      <div className="flex items-start">
        {/* Input image drop zone — video mode only (I2V) */}
        {mode === 'video' && !isRetake && !isIcLora && (
          <div
            className={`relative w-10 h-10 mx-2 mt-2 rounded-lg border-2 border-dashed transition-colors flex items-center justify-center flex-shrink-0 cursor-pointer ${
              isDragOver ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700 hover:border-zinc-500'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            {inputImage ? (
              <>
                <img src={inputImage} alt="" className="w-full h-full object-cover rounded-md" />
                <button
                  onClick={(e) => { e.stopPropagation(); onInputImageChange(null) }}
                  className="absolute -top-1 -right-1 p-0.5 rounded-full bg-zinc-800 text-zinc-400 hover:text-white z-10"
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            ) : (
              <Image className="h-4 w-4 text-zinc-500" />
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}

        {/* Audio drop zone — only in video mode */}
        {mode === 'video' && !isRetake && !isIcLora && (
          <div
            className={`relative w-10 h-10 mt-2 rounded-lg border-2 border-dashed transition-colors flex items-center justify-center flex-shrink-0 cursor-pointer ${
              isAudioDragOver ? 'border-emerald-500 bg-emerald-500/10' : inputAudio ? 'border-emerald-600' : 'border-zinc-700 hover:border-zinc-500'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsAudioDragOver(true) }}
            onDragLeave={() => setIsAudioDragOver(false)}
            onDrop={handleAudioDrop}
            onClick={() => audioInputRef.current?.click()}
            title={inputAudio ? 'Audio attached — click to change' : 'Attach audio for A2V'}
          >
            {inputAudio ? (
              <>
                <Music className="h-4 w-4 text-emerald-400" />
                <button
                  onClick={(e) => { e.stopPropagation(); onInputAudioChange(null) }}
                  className="absolute -top-1 -right-1 p-0.5 rounded-full bg-zinc-800 text-zinc-400 hover:text-white z-10"
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            ) : (
              <Music className="h-4 w-4 text-zinc-500" />
            )}
            <input
              ref={audioInputRef}
              type="file"
              accept=".mp3,.wav,.ogg,.aac,.flac,.m4a"
              onChange={handleAudioFileSelect}
              className="hidden"
            />
          </div>
        )}

        {/* Prompt input - fills remaining width */}
        <div className="flex-1 min-w-0 py-1">
          <textarea
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'retake'
              ? "Describe what should happen in the selected section..."
              : mode === 'ic-lora'
                ? "Describe the style or transformation to apply..."
              : mode === 'image'
                ? "A close-up of a woman talking on the phone..."
                : "The woman sips from a cup of coffee..."
            }
            className="w-full bg-transparent text-white text-sm placeholder:text-zinc-500 focus:outline-none px-2 py-2 resize-none overflow-y-auto h-[70px] leading-5"
          />
        </div>

      </div>
      
      {/* Bottom row: Mode selector + Settings */}
      <div className="flex items-center gap-0.5 px-1.5 py-1.5 border-t border-zinc-800/60 text-xs text-zinc-400">
        {/* Mode dropdown */}
        <SettingsDropdown
          title="MODE"
          value={mode}
          onChange={(v) => onModeChange(v as 'image' | 'video' | 'retake' | 'ic-lora')}
          options={[
            { value: 'image', label: 'Generate Images', icon: <Image className="h-4 w-4" /> },
            { value: 'video', label: 'Generate Videos', icon: <Video className="h-4 w-4" /> },
            { value: 'retake', label: 'Retake', icon: <Scissors className="h-4 w-4" /> },
            ...(canUseIcLora ? [{ value: 'ic-lora', label: 'IC-LoRA', icon: <Sparkles className="h-4 w-4" /> }] : []),
          ]}
          trigger={
            <>
              {mode === 'image' ? <Image className="h-3.5 w-3.5" /> : mode === 'retake' ? <Scissors className="h-3.5 w-3.5" /> : mode === 'ic-lora' ? <Sparkles className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
              <span className="text-zinc-300 font-medium">{mode === 'image' ? 'Image' : mode === 'retake' ? 'Retake' : mode === 'ic-lora' ? 'IC-LoRA' : 'Video'}</span>
              <ChevronUp className="h-3 w-3 text-zinc-500" />
            </>
          }
        />
        
        <div className="flex-1" />
        
        {isRetake ? (
          <div className="text-[10px] text-zinc-500 pr-2">Trim in the panel above, then retake</div>
        ) : isIcLora ? (
          <>
            <SettingsDropdown
              title="CONDITIONING TYPE"
              value={icLoraCondType || 'canny'}
              onChange={(v) => onIcLoraCondTypeChange?.(v as ICLoraConditioningType)}
              options={CONDITIONING_TYPES.map(ct => ({ value: ct.value, label: ct.label }))}
              trigger={
                <>
                  <span className="text-zinc-300 font-medium">{CONDITIONING_TYPES.find(ct => ct.value === icLoraCondType)?.label || 'Canny Edges'}</span>
                  <ChevronUp className="h-3 w-3 text-zinc-500" />
                </>
              }
            />
            <div className="w-px h-4 bg-zinc-700 mx-0.5" />
            <SettingsDropdown
              title="STRENGTH"
              value={String(icLoraStrength ?? 1.0)}
              onChange={(v) => onIcLoraStrengthChange?.(parseFloat(v))}
              options={[
                { value: '0.5', label: '0.50' },
                { value: '0.75', label: '0.75' },
                { value: '1', label: '1.00' },
                { value: '1.25', label: '1.25' },
                { value: '1.5', label: '1.50' },
                { value: '2', label: '2.00' },
              ]}
              trigger={
                <>
                  <span className="text-zinc-500 text-[10px]">STR</span>
                  <span className="text-zinc-300 font-medium">{(icLoraStrength ?? 1.0).toFixed(2)}</span>
                  <ChevronUp className="h-3 w-3 text-zinc-500" />
                </>
              }
            />
          </>
        ) : mode === 'image' ? (
          <>
            {/* Unified Model/Workflow Selector */}
            <SettingsDropdown
              title="MODEL / WORKFLOW"
              value={selectedWorkflowId || 'native'}
              onChange={(v) => onWorkflowSelect(v === 'native' ? null : v)}
              options={[
                { value: 'native', label: 'Z-Image Turbo', icon: <ZitIcon className="h-3.5 w-3.5" /> },
                ...comfyWorkflows
                  .filter(w => w.pipeline === 'image_gen' && w.is_healthy)
                  .map(w => ({ value: w.id, label: w.name, icon: <Sliders className="h-3.5 w-3.5 text-blue-400" /> }))
              ]}
              trigger={
                <>
                  {selectedWorkflowId ? <Sliders className="h-3.5 w-3.5 text-blue-400" /> : <ZitIcon className="h-3.5 w-3.5" />}
                  <span className="text-zinc-300 font-medium">
                    {selectedWorkflowId ? (selectedWorkflow?.name || 'ComfyUI') : 'Z-Image Turbo'}
                  </span>
                  <ChevronUp className="h-3 w-3 text-zinc-500" />
                </>
              }
            />
            
            <div className="w-px h-4 bg-zinc-700 mx-0.5" />

            {/* Resolution dropdown */}
            <SettingsDropdown
              title="IMAGE RESOLUTION"
              value={settings.imageResolution}
              onChange={(v) => onSettingsChange({ ...settings, imageResolution: v })}
              options={[
                { value: '1080p', label: '1080p' },
                { value: '1440p', label: '1440p' },
                { value: '2048p', label: '2048p' },
              ]}
              trigger={
                <>
                  <Monitor className="h-3.5 w-3.5" />
                  <span>{settings.imageResolution.replace('p', '')}</span>
                </>
              }
            />
            
            {/* Aspect ratio dropdown */}
            <SettingsDropdown
              title="RATIO"
              value={settings.aspectRatio}
              onChange={(v) => onSettingsChange({ ...settings, aspectRatio: v })}
              options={[
                { value: '16:9', label: '16:9' },
                { value: '1:1', label: '1:1' },
                { value: '9:16', label: '9:16' },
              ]}
              trigger={
                <>
                  <AspectIcon className="h-3.5 w-3.5" />
                  <span>{settings.aspectRatio}</span>
                </>
              }
            />
            
          </>
        ) : (
          <>
            {/* Unified Model/Workflow Selector for Video */}
            <SettingsDropdown
              title="MODEL / WORKFLOW"
              value={selectedWorkflowId || settings.model}
              onChange={(v) => {
                if (['fast', 'pro'].includes(v)) {
                  onWorkflowSelect(null)
                  onSettingsChange({ ...settings, model: v })
                } else {
                  onWorkflowSelect(v)
                }
              }}
              options={[
                ...(shouldVideoGenerateWithLtxApi
                  ? [
                      { value: 'fast', label: 'LTX-2.3 Fast (API)', icon: <LightricksIcon className="h-3.5 w-3.5" />, disabled: !!inputAudio, tooltip: inputAudio ? 'Fast model is not available for Audio-to-Video' : undefined },
                      { value: 'pro', label: 'LTX-2.3 Pro (API)', icon: <LightricksIcon className="h-3.5 w-3.5" /> },
                    ]
                  : [
                      { value: 'fast', label: 'LTX 2.3 Fast', icon: <LightricksIcon className="h-3.5 w-3.5" /> },
                    ]
                ),
                ...comfyWorkflows.map(w => ({ value: w.id, label: w.name, icon: <Sliders className="h-3.5 w-3.5 text-blue-400" /> }))
              ]}
              trigger={
                <>
                  {selectedWorkflowId ? <Sliders className="h-3.5 w-3.5 text-blue-400" /> : <LightricksIcon className="h-3.5 w-3.5" />}
                  <span className="text-zinc-300 font-medium">
                    {selectedWorkflowId 
                      ? (selectedWorkflow?.name || 'ComfyUI') 
                      : (shouldVideoGenerateWithLtxApi ? (settings.model === 'pro' ? 'LTX-2.3 Pro (API)' : 'LTX-2.3 Fast (API)') : 'LTX 2.3 Fast')
                    }
                  </span>
                  <ChevronUp className="h-3 w-3 text-zinc-500" />
                </>
              }
            />

            <div className="w-px h-4 bg-zinc-700 mx-0.5" />
            
            {/* Duration dropdown */}
            <SettingsDropdown
              title="DURATION"
              value={String(settings.duration)}
              onChange={(v) => onSettingsChange({ ...settings, duration: parseFloat(v) })}
              options={videoDurationOptions.map((value) => ({ value: String(value), label: `${value} Sec` }))}
              trigger={
                <>
                  <Clock className="h-3.5 w-3.5" />
                  <span>{settings.duration}s</span>
                </>
              }
            />
            
            {/* Resolution dropdown */}
            <SettingsDropdown
              title="RESOLUTION"
              value={settings.videoResolution}
              onChange={(v) => {
                const maxDur = LOCAL_MAX_DURATION[v] ?? 20
                const clampedDuration = settings.duration > maxDur ? maxDur : settings.duration
                onSettingsChange({ ...settings, videoResolution: v, duration: clampedDuration })
              }}
              options={videoResolutionOptions.map((value) => ({ value, label: value }))}
              trigger={
                <>
                  <Monitor className="h-3.5 w-3.5" />
                  <span>{settings.videoResolution.replace('p', '')}</span>
                </>
              }
            />

            {shouldVideoGenerateWithLtxApi && (
              <SettingsDropdown
                title="FPS"
                value={String(settings.fps)}
                onChange={(v) => onSettingsChange({ ...settings, fps: parseInt(v) })}
                options={videoFpsOptions.map((value) => ({ value: String(value), label: `${value}` }))}
                trigger={
                  <>
                    <Film className="h-3.5 w-3.5" />
                    <span>{settings.fps} FPS</span>
                  </>
                }
              />
            )}
            
            {/* Aspect Ratio dropdown */}
            <SettingsDropdown
              title="ASPECT RATIO"
              value={settings.aspectRatio}
              onChange={(v) => onSettingsChange({ ...settings, aspectRatio: v })}
              options={inputAudio
                ? [{ value: '16:9', label: '16:9' }]
                : [
                    { value: '16:9', label: '16:9' },
                    { value: '9:16', label: '9:16' },
                  ]
              }
              trigger={
                <>
                  <AspectIcon className="h-3.5 w-3.5" />
                  <span>{settings.aspectRatio}</span>
                </>
              }
            />
            
          </>
        )}
        
        {/* Generate button */}
        <button
          onClick={onGenerate}
          disabled={isGenerating || !canGenerate}
          className={`flex items-center gap-1.5 ml-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all flex-shrink-0 ${
            isGenerating || !canGenerate
              ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
              : 'bg-white text-black hover:bg-zinc-200'
          }`}
        >
          <span className={isGenerating ? 'animate-pulse' : ''}>{buttonIcon}</span>
          {buttonLabel}
        </button>
      </div>
    </div>
  )
}

export function GenSpace() {
  const {
    currentProject,
    currentProjectId,
    addAsset,
    addTakeToAsset,
    deleteAsset,
    toggleFavorite,
    genSpaceEditImageUrl,
    setGenSpaceEditImageUrl,
    genSpaceAudioUrl,
    setGenSpaceAudioUrl,
    genSpaceRetakeSource,
    setGenSpaceRetakeSource,
    setPendingRetakeUpdate,
    genSpaceIcLoraSource,
    setGenSpaceIcLoraSource,
    setPendingIcLoraUpdate,
  } = useProjects()
  const { shouldVideoGenerateWithLtxApi, forceApiGenerations, settings: appSettings } = useAppSettings()
  const [mode, setMode] = useState<'image' | 'video' | 'retake' | 'ic-lora'>('video')
  const [prompt, setPrompt] = useState('')
  const [inputImage, setInputImage] = useState<string | null>(null)
  const [inputAudio, setInputAudio] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [showFavorites, setShowFavorites] = useState(false)
  const [gallerySize, setGallerySize] = useState<GallerySize>('medium')
  const [showSizeMenu, setShowSizeMenu] = useState(false)
  const sizeMenuRef = useRef<HTMLDivElement>(null)
  const persistedVideoKeyRef = useRef<string | null>(null)
  const retakeSubmissionRef = useRef<{
    prompt: string
    input: {
      videoPath: string | null
      startTime: number
      duration: number
      videoDuration: number
    }
  } | null>(null)
  const icLoraSubmissionRef = useRef<{
    prompt: string
    input: {
      videoPath: string
      conditioningType: ICLoraConditioningType
      conditioningStrength: number
    }
  } | null>(null)
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_VIDEO_SETTINGS }))
  const applyForcedVideoSettings = useCallback(
    (next: { model: string; duration: number; videoResolution: string; fps: number; audio: boolean; aspectRatio: string; imageResolution: string; variations: number }) => {
      if (!shouldVideoGenerateWithLtxApi || mode !== 'video') return next
      return sanitizeForcedApiVideoSettings(next, { hasAudio: !!inputAudio })
    },
    [inputAudio, mode, shouldVideoGenerateWithLtxApi],
  )
  
  const {
    generate,
    generateImage,
    isGenerating,
    progress,
    statusMessage,
    videoUrl,
    videoPath,
    imageUrls,
    imagePaths,
    error,
    reset,
  } = useGeneration()

  const {
    submitRetake,
    resetRetake,
    isRetaking,
    retakeStatus,
    retakeResult,
  } = useRetake()

  const [retakeInput, setRetakeInput] = useState({
    videoUrl: null as string | null,
    videoPath: null as string | null,
    startTime: 0,
    duration: 0,
    videoDuration: 0,
    ready: false,
  })
  const [retakePanelKey, setRetakePanelKey] = useState(0)
  const [retakeInitial, setRetakeInitial] = useState<{
    videoUrl: string | null
    videoPath: string | null
    duration?: number
  }>({ videoUrl: null, videoPath: null, duration: undefined })
  const [activeRetakeSource, setActiveRetakeSource] = useState<GenSpaceRetakeSource | null>(null)

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)
  const [comfyWorkflows, setComfyWorkflows] = useState<ComfyUIWorkflow[]>([])

  // Fetch available ComfyUI workflows
  useEffect(() => {
    const fetchWorkflows = async () => {
      try {
        const res = await backendFetch('/api/workflows')
        if (res.ok) {
          const data = await res.json()
          setComfyWorkflows(data)
        }
      } catch (e) {
        console.error('Failed to fetch workflows', e)
      }
    }
    fetchWorkflows()
  }, [])

  const {
    submitIcLora,
    resetIcLora,
    isIcLoraGenerating,
    icLoraStatus,
    icLoraResult,
  } = useIcLora()

  const [icLoraInput, setIcLoraInput] = useState({
    videoUrl: null as string | null,
    videoPath: null as string | null,
    conditioningType: 'canny' as ICLoraConditioningType,
    conditioningStrength: 1.0,
    ready: false,
  })
  const [icLoraPanelKey, setIcLoraPanelKey] = useState(0)
  const [icLoraInitial, setIcLoraInitial] = useState<{
    videoUrl: string | null
    videoPath: string | null
  }>({ videoUrl: null, videoPath: null })

  // Sync edit mode/assets from project context
  useEffect(() => {
    if (genSpaceEditImageUrl) {
      setInputImage(genSpaceEditImageUrl)
      setMode('video')
      setGenSpaceEditImageUrl(null)
    }
  }, [genSpaceEditImageUrl, setGenSpaceEditImageUrl])

  useEffect(() => {
    if (genSpaceAudioUrl) {
      setInputAudio(genSpaceAudioUrl)
      setMode('video')
      setGenSpaceAudioUrl(null)
    }
  }, [genSpaceAudioUrl, setGenSpaceAudioUrl])

  useEffect(() => {
    if (genSpaceRetakeSource) {
      setActiveRetakeSource(genSpaceRetakeSource)
      setRetakeInitial({
        videoUrl: genSpaceRetakeSource.videoUrl,
        videoPath: genSpaceRetakeSource.videoPath,
        duration: genSpaceRetakeSource.duration,
      })
      setMode('retake')
      setGenSpaceRetakeSource(null)
      setRetakePanelKey((prev) => prev + 1)
    }
  }, [genSpaceRetakeSource, setGenSpaceRetakeSource])

  useEffect(() => {
    if (genSpaceIcLoraSource) {
      setIcLoraInitial({
        videoUrl: genSpaceIcLoraSource.videoUrl,
        videoPath: genSpaceIcLoraSource.videoPath,
      })
      setMode('ic-lora')
      setGenSpaceIcLoraSource(null)
      setIcLoraPanelKey((prev) => prev + 1)
    }
  }, [genSpaceIcLoraSource, setGenSpaceIcLoraSource])

  // Effect to handle generation completion
  useEffect(() => {
    if (!isGenerating && videoUrl && videoPath && currentProjectId) {
      // Prevent duplicate adds if useEffect triggers again
      if (persistedVideoKeyRef.current === videoUrl) return
      persistedVideoKeyRef.current = videoUrl

      const resolution = mode === 'image' ? settings.imageResolution : settings.videoResolution
      const duration = mode === 'image' ? undefined : settings.duration

      addAsset(currentProjectId, {
        type: mode === 'image' ? 'image' : 'video',
        url: videoUrl,
        path: videoPath,
        prompt: prompt,
        resolution,
        duration,
      })
    }
  }, [isGenerating, videoUrl, videoPath, currentProjectId, addAsset, prompt, settings, mode])

  // Handle multiple images from variations
  useEffect(() => {
    if (!isGenerating && imageUrls.length > 0 && imagePaths.length > 0 && currentProjectId && mode === 'image') {
      if (persistedVideoKeyRef.current === imageUrls[0]) return
      persistedVideoKeyRef.current = imageUrls[0]

      imageUrls.forEach((url, i) => {
        addAsset(currentProjectId, {
          type: 'image',
          url: url,
          path: imagePaths[i],
          prompt: prompt,
          resolution: settings.imageResolution,
        })
      })
    }
  }, [isGenerating, imageUrls, imagePaths, currentProjectId, addAsset, prompt, settings, mode])

  // Handle retake completion
  useEffect(() => {
    if (retakeStatus === 'complete' && retakeResult?.videoPath && currentProjectId && retakeSubmissionRef.current) {
      const { videoPath: resPath } = retakeResult
      const normalized = resPath.replace(/\\/g, '/')
      const fileUrl = normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
      
      const { input } = retakeSubmissionRef.current
      
      if (activeRetakeSource && activeRetakeSource.assetId) {
        addTakeToAsset(currentProjectId, activeRetakeSource.assetId, {
          url: fileUrl,
          path: resPath,
          createdAt: Date.now(),
        })
      } else {
        addAsset(currentProjectId, {
          type: 'video',
          url: fileUrl,
          path: resPath,
          prompt: retakeSubmissionRef.current.prompt,
          resolution: settings.videoResolution,
          duration: input.videoDuration,
        })
      }
      
      setPendingRetakeUpdate({ assetId: activeRetakeSource?.assetId || '', clipIds: activeRetakeSource?.linkedClipIds || [], newTakeIndex: -1 })
      retakeSubmissionRef.current = null
      resetRetake()
    }
  }, [retakeStatus, retakeResult, currentProjectId, addAsset, addTakeToAsset, activeRetakeSource, settings.videoResolution, setPendingRetakeUpdate, resetRetake])

  // Handle IC-LoRA completion
  useEffect(() => {
    if (icLoraStatus === 'complete' && icLoraResult?.videoPath && currentProjectId && icLoraSubmissionRef.current) {
      const { videoPath: resPath } = icLoraResult
      const normalized = resPath.replace(/\\/g, '/')
      const fileUrl = normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
      
      const { prompt: subPrompt } = icLoraSubmissionRef.current
      
      addAsset(currentProjectId, {
        type: 'video',
        url: fileUrl,
        path: resPath,
        prompt: subPrompt,
        resolution: settings.videoResolution,
        duration: settings.duration,
      })
      
      setPendingIcLoraUpdate({ assetId: '', clipIds: [], newTakeIndex: -1 })
      icLoraSubmissionRef.current = null
      resetIcLora()
    }
  }, [icLoraStatus, icLoraResult, currentProjectId, addAsset, settings.videoResolution, settings.duration, setPendingIcLoraUpdate, resetIcLora])

  const handleGenerate = async () => {
    if (!prompt.trim() && mode !== 'retake' && mode !== 'ic-lora') return

    if (mode === 'retake') {
      if (!retakeInput.ready || !retakeInput.videoPath) {
        setLocalError('Please select a video and trim range first.')
        return
      }
      retakeSubmissionRef.current = { prompt, input: retakeInput }
      submitRetake({
        videoPath: retakeInput.videoPath,
        prompt,
        startTime: retakeInput.startTime,
        duration: retakeInput.duration,
        mode: 'replace_audio_and_video',
      })
      return
    }

    if (mode === 'ic-lora') {
      if (!icLoraInput.ready || !icLoraInput.videoPath) {
        setLocalError('Please select a reference video first.')
        return
      }
      icLoraSubmissionRef.current = { prompt, input: { ...icLoraInput, videoPath: icLoraInput.videoPath! } }
      submitIcLora({
        videoPath: icLoraInput.videoPath,
        prompt,
        conditioningType: icLoraInput.conditioningType,
        conditioningStrength: icLoraInput.conditioningStrength,
      })
      return
    }

    if (mode === 'image') {
      generateImage(
        prompt,
        {
          model: 'fast' as 'fast' | 'pro',
          duration: 5,
          videoResolution: settings.videoResolution,
          fps: 24,
          audio: false,
          cameraMotion: 'none',
          imageResolution: settings.imageResolution,
          imageAspectRatio: settings.aspectRatio,
          imageSteps: 4,
          variations: settings.variations,
        },
        selectedWorkflowId || undefined
      )
    } else {
      let imagePath = inputImage ? fileUrlToPath(inputImage) : null
      let audioPath = inputAudio ? fileUrlToPath(inputAudio) : null
      
      const videoSettings = applyForcedVideoSettings(settings)
      if (audioPath) videoSettings.model = 'pro'

      generate(
        prompt,
        imagePath,
        {
          model: (selectedWorkflowId ? 'fast' : videoSettings.model) as 'fast' | 'pro',
          duration: videoSettings.duration,
          videoResolution: videoSettings.videoResolution,
          fps: videoSettings.fps,
          audio: videoSettings.audio || false,
          cameraMotion: 'none',
          aspectRatio: videoSettings.aspectRatio,
          imageResolution: videoSettings.imageResolution,
          imageAspectRatio: videoSettings.aspectRatio,
          imageSteps: 4,
        },
        audioPath,
        selectedWorkflowId || undefined
      )
    }
  }
  
  const handleDelete = (assetId: string) => {
    if (currentProjectId) {
      deleteAsset(currentProjectId, assetId)
    }
  }
  
  const handleSelectAsset = (asset: Asset) => {
    setSelectedAsset(asset)
  }

  const goToNext = () => {
    if (!selectedAsset) return
    const index = filteredAssets.findIndex(a => a.id === selectedAsset.id)
    if (index < filteredAssets.length - 1) {
      setSelectedAsset(filteredAssets[index + 1])
    }
  }

  const goToPrev = () => {
    if (!selectedAsset) return
    const index = filteredAssets.findIndex(a => a.id === selectedAsset.id)
    if (index > 0) {
      setSelectedAsset(filteredAssets[index - 1])
    }
  }

  const filteredAssets = (currentProject?.assets || [])
    .filter(a => !showFavorites || a.favorite)
    .sort((a, b) => b.createdAt - a.createdAt)

  const selectedIndex = selectedAsset ? filteredAssets.findIndex(a => a.id === selectedAsset.id) : -1
  const canGoNext = selectedIndex < filteredAssets.length - 1
  const canGoPrev = selectedIndex > 0

  const promptGenerating = isGenerating || isRetaking || isIcLoraGenerating
  const promptButtonLabel = isRetaking ? 'Retaking...' : isIcLoraGenerating ? 'Applying LoRA...' : mode === 'image' ? 'Generate Image' : 'Generate Video'
  const promptButtonIcon = promptGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />
  const canSubmit = mode === 'retake' ? retakeInput.ready : mode === 'ic-lora' ? icLoraInput.ready : true

  const icLoraCondType = icLoraInput.conditioningType
  const setIcLoraCondType = (type: ICLoraConditioningType) => setIcLoraInput(prev => ({ ...prev, conditioningType: type }))
  const icLoraStrength = icLoraInput.conditioningStrength
  const setIcLoraStrength = (strength: number) => setIcLoraInput(prev => ({ ...prev, conditioningStrength: strength }))

  const combinedStatusMessage = statusMessage || retakeStatus || icLoraStatus

  return (
    <div className="flex flex-col h-full bg-black text-white overflow-hidden">
      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* Gallery Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/50 bg-zinc-900/30 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold tracking-tight">Project Library</h2>
            <div className="flex bg-zinc-800/50 p-1 rounded-lg">
              <button
                onClick={() => setShowFavorites(false)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  !showFavorites ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                All Assets
              </button>
              <button
                onClick={() => setShowFavorites(true)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  showFavorites ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Favorites
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Gallery Size Selector */}
            <div className="relative" ref={sizeMenuRef}>
              <button
                onClick={() => setShowSizeMenu(!showSizeMenu)}
                className="p-2 rounded-lg bg-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all border border-zinc-700/50"
                title="Gallery view size"
              >
                {gallerySize === 'small' ? <GridSmallIcon className="h-4 w-4" /> : gallerySize === 'medium' ? <GridMediumIcon className="h-4 w-4" /> : <GridLargeIcon className="h-4 w-4" />}
              </button>
              
              {showSizeMenu && (
                <div className="absolute right-0 top-full mt-2 w-32 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden z-20 animate-in fade-in slide-in-from-top-1">
                  {(['small', 'medium', 'large'] as GallerySize[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => { setGallerySize(s); setShowSizeMenu(false) }}
                      className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2 transition-colors hover:bg-zinc-800 ${
                        gallerySize === s ? 'text-blue-400 bg-blue-500/5' : 'text-zinc-400'
                      }`}
                    >
                      {s === 'small' ? <GridSmallIcon className="h-3.5 w-3.5" /> : s === 'medium' ? <GridMediumIcon className="h-3.5 w-3.5" /> : <GridLargeIcon className="h-3.5 w-3.5" />}
                      <span className="capitalize">{s}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Assets Grid */}
        <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
          {filteredAssets.length > 0 ? (
            <div className={`grid gap-4 ${gallerySizeClasses[gallerySize]}`}>
              {filteredAssets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  isSelected={selectedAsset?.id === asset.id}
                  onSelect={handleSelectAsset}
                  onDelete={handleDelete}
                  onToggleFavorite={(id) => currentProjectId && toggleFavorite(currentProjectId, id)}
                  onPlay={handleSelectAsset}
                  onDragStart={(e, a) => {
                    e.dataTransfer.setData('asset', JSON.stringify(a))
                  }}
                  size={gallerySize}
                />
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-4">
              <div className="p-6 rounded-full bg-zinc-900/50 border border-zinc-800/50">
                <Video className="h-12 w-12 opacity-20" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-zinc-400">Your library is empty</p>
                <p className="text-xs">Use the prompt bar below to generate images and videos.</p>
              </div>
            </div>
          )}
        </div>

        {/* Active Tool Panels (Retake / IC-LoRA) */}
        {mode === 'retake' && (
          <div className="px-6 pb-4 animate-in slide-in-from-bottom-4">
            <RetakePanel
              key={retakePanelKey}
              initialVideoUrl={retakeInitial.videoUrl}
              initialVideoPath={retakeInitial.videoPath}
              initialDuration={retakeInitial.duration}
              onChange={(data) => setRetakeInput({ ...data, ready: true })}
            />
          </div>
        )}

        {mode === 'ic-lora' && (
          <div className="px-6 pb-4 animate-in slide-in-from-bottom-4">
            <ICLoraPanel
              key={icLoraPanelKey}
              initialVideoUrl={icLoraInitial.videoUrl}
              initialVideoPath={icLoraInitial.videoPath}
              onChange={(data) => setIcLoraInput(prev => ({ ...prev, videoUrl: data.videoUrl, videoPath: data.videoPath, ready: true }))}
            />
          </div>
        )}

        {/* Global Progress Bar (Floating) */}
        {promptGenerating && (
          <div className="absolute bottom-[100px] left-1/2 -translate-x-1/2 w-[400px] z-20">
            <div className="bg-zinc-900/90 backdrop-blur-xl border border-zinc-700/50 rounded-2xl p-4 shadow-2xl">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                  <span className="text-xs font-medium text-zinc-200">{combinedStatusMessage || 'Processing...'}</span>
                </div>
                <span className="text-[10px] font-bold text-blue-400">{Math.round(progress)}%</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Control area */}
      <div className="p-6 pt-2 bg-zinc-900/50 border-t border-zinc-800/50 backdrop-blur-md">
        <FreeApiKeyBubble 
          forceApiGenerations={forceApiGenerations}
          hasLtxApiKey={appSettings.hasLtxApiKey}
          isGenerating={promptGenerating}
        />
        
        {/* Prompt bar */}
        <PromptBar
          mode={mode}
          onModeChange={setMode}
          canUseIcLora={!forceApiGenerations}
          prompt={prompt}
          onPromptChange={setPrompt}
          onGenerate={handleGenerate}
          isGenerating={promptGenerating}
          canGenerate={canSubmit}
          buttonLabel={promptButtonLabel}
          buttonIcon={promptButtonIcon}
          inputImage={inputImage}
          onInputImageChange={setInputImage}
          inputAudio={inputAudio}
          onInputAudioChange={setInputAudio}
          settings={settings}
          onSettingsChange={(nextSettings) => setSettings(applyForcedVideoSettings(nextSettings))}
          shouldVideoGenerateWithLtxApi={shouldVideoGenerateWithLtxApi}
          icLoraCondType={icLoraCondType}
          onIcLoraCondTypeChange={setIcLoraCondType}
          icLoraStrength={icLoraStrength}
          onIcLoraStrengthChange={setIcLoraStrength}
          selectedWorkflowId={selectedWorkflowId}
          onWorkflowSelect={(id) => {
            setSelectedWorkflowId(id)
          }}
          comfyWorkflows={comfyWorkflows}
        />
      </div>
      
      {/* Asset preview modal */}
      {selectedAsset && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setSelectedAsset(null)}
        >
          {/* Previous button */}
          <button
            onClick={(e) => { e.stopPropagation(); goToPrev() }}
            disabled={!canGoPrev}
            className={`absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full backdrop-blur-md transition-all ${
              canGoPrev
                ? 'bg-white/10 text-white hover:bg-white/20 cursor-pointer'
                : 'bg-white/5 text-zinc-600 cursor-default'
            }`}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          {/* Next button */}
          <button
            onClick={(e) => { e.stopPropagation(); goToNext() }}
            disabled={!canGoNext}
            className={`absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full backdrop-blur-md transition-all ${
              canGoNext
                ? 'bg-white/10 text-white hover:bg-white/20 cursor-pointer'
                : 'bg-white/5 text-zinc-600 cursor-default'
            }`}
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          {/* Content area */}
          <div className="relative max-w-5xl w-full max-h-full px-20 py-8" onClick={e => e.stopPropagation()}>
            {/* Top bar: counter + close */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-zinc-500 font-medium">
                {selectedIndex + 1} / {filteredAssets.length}
              </span>
              <button
                onClick={() => setSelectedAsset(null)}
                className="p-2 rounded-md text-zinc-400 hover:text-white transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {selectedAsset.type === 'video' ? (
              <video
                key={selectedAsset.id}
                src={selectedAsset.url}
                controls
                autoPlay
                className="w-full rounded-xl object-contain max-h-[75vh]"
              />
            ) : (
              <img
                key={selectedAsset.id}
                src={selectedAsset.url}
                alt=""
                className="w-full rounded-xl object-contain max-h-[75vh]"
              />
            )}
            <div className="mt-4 text-center">
              <div className="inline-flex items-start gap-2 max-w-full">
                <p className="text-zinc-300">{selectedAsset.prompt}</p>
                {selectedAsset.prompt && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedAsset.prompt)
                      setCopiedPrompt(true)
                      setTimeout(() => setCopiedPrompt(false), 2000)
                    }}
                    className="shrink-0 p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                    title="Copy prompt"
                  >
                    {copiedPrompt ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                )}
              </div>
              <p className="text-zinc-500 text-sm mt-1">
                {selectedAsset.resolution} • {selectedAsset.duration ? `${selectedAsset.duration}s` : 'Image'}
              </p>
            </div>
          </div>
        </div>
      )}

      {(error || localError) && (
        <GenerationErrorDialog
          error={(error || localError)!}
          onDismiss={() => {
            if (error) reset()
            if (localError) {
              setLocalError(null)
              resetRetake()
              resetIcLora()
            }
          }}
        />
      )}
    </div>
  )
}
