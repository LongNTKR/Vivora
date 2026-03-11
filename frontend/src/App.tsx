import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ChatPage from '@/pages/ChatPage'
import LibraryPage from '@/pages/LibraryPage'
import Layout from '@/components/layout/Layout'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/chat" replace />} />
          <Route path="chat/:sessionId?" element={<ChatPage />} />
          <Route path="library" element={<LibraryPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
