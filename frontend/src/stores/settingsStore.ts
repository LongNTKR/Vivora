import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const CHAT_MODELS = [
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
    { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite Preview' },
]

export const VIDEO_MODELS = [
    { value: 'veo-3.1-generate-preview', label: 'Veo 3.1 Generate Preview' },
    { value: 'veo-3.1-fast-generate-preview', label: 'Veo 3.1 Fast Generate Preview' },
    { value: 'veo-3.0-generate-001', label: 'Veo 3.0 Generate 001' },
    { value: 'veo-3.0-fast-generate-001', label: 'Veo 3.0 Fast Generate 001' },
]

export const NANO_BANANA_MODELS = [
    { value: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image Preview' },
    { value: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image Preview' },
    { value: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image' },
]

export const IMAGEN_MODELS = [
    { value: 'imagen-4.0-generate-001', label: 'Imagen 4.0 Generate' },
    { value: 'imagen-4.0-ultra-generate-001', label: 'Imagen 4.0 Ultra Generate' },
    { value: 'imagen-4.0-fast-generate-001', label: 'Imagen 4.0 Fast Generate' },
]

export const TTS_MODELS = [
    { value: 'gemini-2.5-flash-preview-tts', label: 'Gemini 2.5 Flash Preview TTS' },
    { value: 'gemini-2.5-pro-preview-tts', label: 'Gemini 2.5 Pro Preview TTS' },
]

export const DEFAULT_CHAT_MODEL = CHAT_MODELS[0].value
export const DEFAULT_VIDEO_MODEL = VIDEO_MODELS[0].value
export const DEFAULT_NANO_BANANA_MODEL = NANO_BANANA_MODELS[0].value
export const DEFAULT_IMAGEN_MODEL = IMAGEN_MODELS[0].value
export const DEFAULT_TTS_MODEL = TTS_MODELS[0].value

interface SettingsState {
    apiKey: string
    chatModel: string
    videoModel: string
    nanoBananaModel: string
    imagenModel: string
    ttsModel: string
    setApiKey: (key: string) => void
    setChatModel: (model: string) => void
    setVideoModel: (model: string) => void
    setNanoBananaModel: (model: string) => void
    setImagenModel: (model: string) => void
    setTtsModel: (model: string) => void
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            apiKey: '',
            chatModel: DEFAULT_CHAT_MODEL,
            videoModel: DEFAULT_VIDEO_MODEL,
            nanoBananaModel: DEFAULT_NANO_BANANA_MODEL,
            imagenModel: DEFAULT_IMAGEN_MODEL,
            ttsModel: DEFAULT_TTS_MODEL,
            setApiKey: (apiKey) => set({ apiKey }),
            setChatModel: (chatModel) => set({ chatModel }),
            setVideoModel: (videoModel) => set({ videoModel }),
            setNanoBananaModel: (nanoBananaModel) => set({ nanoBananaModel }),
            setImagenModel: (imagenModel) => set({ imagenModel }),
            setTtsModel: (ttsModel) => set({ ttsModel }),
        }),
        {
            name: 'vivora-settings',
            version: 4,
            migrate: (persisted: unknown, version: number) => {
                const state = persisted as Record<string, unknown>
                if (version < 2 && state.model) {
                    state.chatModel = state.model
                    delete state.model
                }
                // v4: normalize legacy/invalid videoModel value
                const legacyVideoModelMap: Record<string, string> = {
                    // Older preview ids → stable ids
                    'veo-3-generate-preview': 'veo-3.0-generate-001',
                    'veo-3-fast-generate-preview': 'veo-3.0-fast-generate-001',
                    'veo-3.0-generate-preview': 'veo-3.0-generate-001',
                    'veo-3.0-fast-generate-preview': 'veo-3.0-fast-generate-001',
                    // Veo 2 is not offered in Vivora; fall back to default.
                    'veo-2-generate-preview': 'veo-3.1-generate-preview',
                }
                const currentVideoModel = state.videoModel as string | undefined
                if (currentVideoModel && legacyVideoModelMap[currentVideoModel]) {
                    state.videoModel = legacyVideoModelMap[currentVideoModel]
                }
                const validVideoModels = new Set([
                    'veo-3.1-generate-preview',
                    'veo-3.1-fast-generate-preview',
                    'veo-3.0-generate-001',
                    'veo-3.0-fast-generate-001',
                ])
                if (!validVideoModels.has(state.videoModel as string)) {
                    state.videoModel = 'veo-3.1-generate-preview'
                }
                return state as unknown as SettingsState
            },
        },
    ),
)
