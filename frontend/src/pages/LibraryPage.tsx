import { useQuery } from '@tanstack/react-query'
import { videosApi } from '@/lib/api'
import VideoCard from '@/components/video/VideoCard'
import type { VideoJob } from '@/types'
import { Video, Loader2 } from 'lucide-react'

export default function LibraryPage() {
  const { data: videos, isLoading } = useQuery<VideoJob[]>({
    queryKey: ['videos'],
    queryFn: () => videosApi.list().then((r) => r.data),
    refetchInterval: 10_000,
  })

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Video Library</h1>
          <p className="text-muted-foreground mt-1">All your AI-generated videos</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !videos?.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
              <Video className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">No videos yet</h3>
            <p className="text-muted-foreground mt-1">
              Start a conversation to create your first AI video
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {videos.map((job) => (
              <VideoCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
