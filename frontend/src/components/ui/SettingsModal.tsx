import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Settings, X, Eye, EyeOff, Key, MessageSquare, Film, ImageIcon, Layers, Mic, Check } from 'lucide-react'
import {
    useSettingsStore,
    CHAT_MODELS,
    VIDEO_MODELS,
    NANO_BANANA_MODELS,
    IMAGEN_MODELS,
    TTS_MODELS,
} from '@/stores/settingsStore'
import { cn } from '@/lib/utils'

interface ModelOption {
    value: string
    label: string
}

function ModelPicker({
    models,
    value,
    onChange,
}: {
    models: ModelOption[]
    value: string
    onChange: (v: string) => void
}) {
    return (
        <div className="grid gap-2">
            {models.map((m) => (
                <button
                    key={m.value}
                    type="button"
                    onClick={() => onChange(m.value)}
                    className={cn(
                        'flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors',
                        value === m.value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background text-foreground hover:border-muted-foreground/50 hover:bg-accent',
                    )}
                >
                    <span className="font-medium">{m.label}</span>
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{m.value}</span>
                        {value === m.value && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </div>
                </button>
            ))}
        </div>
    )
}

export default function SettingsModal() {
    const {
        apiKey,
        chatModel,
        videoModel,
        nanoBananaModel,
        imagenModel,
        ttsModel,
        setApiKey,
        setChatModel,
        setVideoModel,
        setNanoBananaModel,
        setImagenModel,
        setTtsModel,
    } = useSettingsStore()

    const [open, setOpen] = useState(false)
    const [localKey, setLocalKey] = useState(apiKey)
    const [localChatModel, setLocalChatModel] = useState(chatModel)
    const [localVideoModel, setLocalVideoModel] = useState(videoModel)
    const [localNanoBananaModel, setLocalNanoBananaModel] = useState(nanoBananaModel)
    const [localImagenModel, setLocalImagenModel] = useState(imagenModel)
    const [localTtsModel, setLocalTtsModel] = useState(ttsModel)
    const [showKey, setShowKey] = useState(false)
    const [saved, setSaved] = useState(false)

    const hasKey = Boolean(apiKey)

    function handleOpen(v: boolean) {
        if (v) {
            setLocalKey(apiKey)
            setLocalChatModel(chatModel)
            setLocalVideoModel(videoModel)
            setLocalNanoBananaModel(nanoBananaModel)
            setLocalImagenModel(imagenModel)
            setLocalTtsModel(ttsModel)
            setSaved(false)
        }
        setOpen(v)
    }

    function handleSave() {
        setApiKey(localKey.trim())
        setChatModel(localChatModel)
        setVideoModel(localVideoModel)
        setNanoBananaModel(localNanoBananaModel)
        setImagenModel(localImagenModel)
        setTtsModel(localTtsModel)
        setSaved(true)
        setTimeout(() => setOpen(false), 800)
    }

    return (
        <Dialog.Root open={open} onOpenChange={handleOpen}>
            <Dialog.Trigger asChild>
                <button
                    id="settings-trigger-btn"
                    className={cn(
                        'group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                    title="Cài đặt API"
                >
                    <Settings className="h-4 w-4" />
                    <span>Cài đặt</span>
                    {hasKey && (
                        <span
                            className="ml-auto h-2 w-2 rounded-full bg-emerald-500"
                            title="API key đang được dùng"
                        />
                    )}
                </button>
            </Dialog.Trigger>

            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                <Dialog.Content
                    id="settings-dialog"
                    className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-card shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b px-6 py-4">
                        <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
                            <Settings className="h-4 w-4 text-primary" />
                            Cài đặt API
                        </Dialog.Title>
                        <Dialog.Close asChild>
                            <button
                                id="settings-close-btn"
                                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </Dialog.Close>
                    </div>

                    {/* Scrollable content */}
                    <div className="overflow-y-auto max-h-[70vh] p-6 space-y-6">
                        {/* API Key */}
                        <div>
                            <label
                                htmlFor="api-key-input"
                                className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
                            >
                                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                                Google AI API Key
                            </label>
                            <p className="mb-2 text-xs text-muted-foreground">
                                Để trống nếu muốn dùng key mặc định của server.
                            </p>
                            <div className="relative">
                                <input
                                    id="api-key-input"
                                    type={showKey ? 'text' : 'password'}
                                    value={localKey}
                                    onChange={(e) => setLocalKey(e.target.value)}
                                    placeholder="AIza..."
                                    className="w-full rounded-lg border bg-background px-3 py-2 pr-10 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                    autoComplete="off"
                                    spellCheck={false}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowKey((v) => !v)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                                    tabIndex={-1}
                                >
                                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Chat Model */}
                        <div>
                            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                                Chat Model
                            </label>
                            <p className="mb-2 text-xs text-muted-foreground">
                                Gemini model dùng cho hội thoại.
                            </p>
                            <ModelPicker
                                models={CHAT_MODELS}
                                value={localChatModel}
                                onChange={setLocalChatModel}
                            />
                        </div>

                        {/* Video Model */}
                        <div>
                            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                                <Film className="h-3.5 w-3.5 text-muted-foreground" />
                                Video Model
                            </label>
                            <p className="mb-2 text-xs text-muted-foreground">
                                Veo model dùng để tạo video.
                            </p>
                            <ModelPicker
                                models={VIDEO_MODELS}
                                value={localVideoModel}
                                onChange={setLocalVideoModel}
                            />
                        </div>

                        {/* Nano Banana Model */}
                        <div>
                            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                                <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                Nano Banana Model
                            </label>
                            <p className="mb-2 text-xs text-muted-foreground">
                                Gemini model dùng để tạo ảnh (sắp ra mắt).
                            </p>
                            <ModelPicker
                                models={NANO_BANANA_MODELS}
                                value={localNanoBananaModel}
                                onChange={setLocalNanoBananaModel}
                            />
                        </div>

                        {/* Imagen Model */}
                        <div>
                            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                                Imagen Model
                            </label>
                            <p className="mb-2 text-xs text-muted-foreground">
                                Imagen model dùng để tạo ảnh (sắp ra mắt).
                            </p>
                            <ModelPicker
                                models={IMAGEN_MODELS}
                                value={localImagenModel}
                                onChange={setLocalImagenModel}
                            />
                        </div>

                        {/* TTS Model */}
                        <div>
                            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                                <Mic className="h-3.5 w-3.5 text-muted-foreground" />
                                TTS Model
                            </label>
                            <p className="mb-2 text-xs text-muted-foreground">
                                Gemini model dùng cho voiceover.
                            </p>
                            <ModelPicker
                                models={TTS_MODELS}
                                value={localTtsModel}
                                onChange={setLocalTtsModel}
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 border-t px-6 py-4">
                        <Dialog.Close asChild>
                            <button
                                id="settings-cancel-btn"
                                className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                            >
                                Hủy
                            </button>
                        </Dialog.Close>
                        <button
                            id="settings-save-btn"
                            type="button"
                            onClick={handleSave}
                            className={cn(
                                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all',
                                saved
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-primary text-primary-foreground hover:bg-primary/90',
                            )}
                        >
                            {saved ? (
                                <>
                                    <Check className="h-4 w-4" />
                                    Đã lưu!
                                </>
                            ) : (
                                'Lưu cài đặt'
                            )}
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}
