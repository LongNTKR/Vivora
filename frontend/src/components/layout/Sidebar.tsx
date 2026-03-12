import { useRef, useCallback, useEffect, useState } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import { Zap, Plus, Video, Trash2 } from 'lucide-react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn, formatDate } from '@/lib/utils'
import { chatApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import SettingsModal from '@/components/ui/SettingsModal'
import * as Dialog from '@radix-ui/react-dialog'
import type { ChatSession } from '@/types'

const PAGE_SIZE = 20

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description: string
  onConfirm: () => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg bg-card border p-6 shadow-lg">
          <Dialog.Title className="text-base font-semibold mb-2">{title}</Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mb-5">
            {description}
          </Dialog.Description>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                onConfirm()
                onOpenChange(false)
              }}
            >
              Xóa
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default function Sidebar() {
  const navigate = useNavigate()
  const { sessionId } = useParams()
  const bottomRef = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['chat-sessions'],
      queryFn: ({ pageParam = 0 }) =>
        chatApi.listSessions(PAGE_SIZE, pageParam as number).then((r) => r.data as ChatSession[]),
      getNextPageParam: (lastPage, allPages) =>
        lastPage.length === PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined,
      initialPageParam: 0,
    })

  const sessions = data?.pages.flat() ?? []

  const deleteSessionMutation = useMutation({
    mutationFn: (id: string) => chatApi.deleteSession(id),
    onSuccess: (_data, deletedId) => {
      qc.setQueryData(['chat-sessions'], (old: typeof data) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => page.filter((s: ChatSession) => s.id !== deletedId)),
        }
      })
      if (deletedId === sessionId) {
        navigate('/chat', { replace: true })
      }
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ['chat-sessions'] })
    },
  })

  const deleteAllMutation = useMutation({
    mutationFn: () => chatApi.deleteAllSessions(),
    onSuccess: () => {
      qc.setQueryData(['chat-sessions'], (old: typeof data) => {
        if (!old) return old
        return { ...old, pages: [[]] }
      })
      navigate('/chat', { replace: true })
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ['chat-sessions'] })
    },
  })

  // Infinite scroll via IntersectionObserver
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  )

  useEffect(() => {
    const el = bottomRef.current
    if (!el) return
    const observer = new IntersectionObserver(handleObserver, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleObserver])

  const handleNewChat = () => {
    navigate('/chat')
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Zap className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-lg font-bold">Vivora</span>
      </div>

      {/* New Chat */}
      <div className="px-3 pt-3">
        <Button
          variant="outline"
          className="w-full justify-start gap-2 text-sm"
          onClick={handleNewChat}
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      {/* Library link */}
      <div className="px-3 pt-2">
        <NavLink to="/library">
          {({ isActive }) => (
            <div
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Video className="h-4 w-4" />
              Library
            </div>
          )}
        </NavLink>
      </div>

      <div className="mx-3 my-2 border-t" />

      {/* Session list header */}
      {sessions.length > 0 && (
        <div className="flex items-center justify-between px-3 pb-1">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Conversations
          </span>
          <button
            onClick={() => setConfirmDeleteAll(true)}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            title="Xóa tất cả"
          >
            Xóa tất cả
          </button>
        </div>
      )}

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-1">
        {sessions.map((s) => (
          <div key={s.id} className="group relative">
            <button
              onClick={() => navigate(`/chat/${s.id}`)}
              className={cn(
                'w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-accent transition-colors pr-8',
                s.id === sessionId && 'bg-accent font-medium',
              )}
            >
              <p className="truncate">{s.title || 'New conversation'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDate(s.created_at)}
              </p>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setConfirmDeleteId(s.id)
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all"
              title="Xóa hội thoại"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {isFetchingNextPage && (
          <p className="text-xs text-muted-foreground text-center py-2">Loading…</p>
        )}
        <div ref={bottomRef} className="h-1" />
      </div>

      <div className="mx-3 border-t" />

      {/* Settings */}
      <div className="px-3 py-3">
        <SettingsModal />
      </div>

      {/* Confirm delete single session */}
      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(v) => { if (!v) setConfirmDeleteId(null) }}
        title="Xóa hội thoại?"
        description="Toàn bộ tin nhắn sẽ bị xóa. Video đã tạo vẫn được giữ lại trong thư viện."
        onConfirm={() => {
          if (confirmDeleteId) deleteSessionMutation.mutate(confirmDeleteId)
          setConfirmDeleteId(null)
        }}
      />

      {/* Confirm delete all sessions */}
      <ConfirmDialog
        open={confirmDeleteAll}
        onOpenChange={setConfirmDeleteAll}
        title="Xóa tất cả hội thoại?"
        description="Toàn bộ lịch sử hội thoại sẽ bị xóa vĩnh viễn. Video đã tạo vẫn được giữ lại trong thư viện."
        onConfirm={() => deleteAllMutation.mutate()}
      />
    </aside>
  )
}
