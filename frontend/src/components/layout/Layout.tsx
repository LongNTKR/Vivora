import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useWebSocket } from '@/hooks/useWebSocket'

export default function Layout() {
  useWebSocket()

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
