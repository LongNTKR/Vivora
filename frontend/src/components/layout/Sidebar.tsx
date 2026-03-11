import { useRef, useCallback, useEffect } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import { Zap, Plus, Video, Settings2 } from 'lucide-react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { chatApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import SettingsModal from '@/components/ui/SettingsModal'
import type { ChatSession } from '@/types'

const PAGE_SIZE = 20

export default function Sidebar() {
  const navigate = useNavigate()
  const { sessionId } = useParams()
  const bottomRef = useRef<HTMLDivElement>(null)

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

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-1">
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => navigate(`/chat/${s.id}`)}
            className={cn(
              'w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-accent transition-colors',
              s.id === sessionId && 'bg-accent font-medium',
            )}
          >
            <p className="truncate">{s.title || 'New conversation'}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(s.created_at).toLocaleDateString()}
            </p>
          </button>
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
    </aside>
  )
}
