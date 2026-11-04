import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppShell from './components/AppShell'
import Shelf from './screens/Shelf'
import AlbumDetail from './screens/AlbumDetail'

export default function App() {
  // 既定だと Router が遷移を startTransition で包み、View Transition の中の flushSync でも
  // DOM が確定しない（棚のまま撮られて、ジャケの滑走が偶然頼みになる）。同期で確定させる。
  return (
    <BrowserRouter useTransitions={false}>
      <AppShell>
        <Routes>
          <Route path="/" element={<Shelf />} />
          <Route path="/album/:id" element={<AlbumDetail />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
