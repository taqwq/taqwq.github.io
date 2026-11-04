import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// 開発時だけ: ?seed で見本の棚に差し替える（本番ビルドではこの分岐ごと消える）
if (import.meta.env.DEV) {
  const seed = new URLSearchParams(location.search).get('seed')
  if (seed !== null) void import('./dev/seed').then((m) => m.seedDemoShelf(seed))
}

// 棚は端末の中にしか無いので、消されにくくしてもらう（許すかはブラウザが決める。ホーム画面のアプリで効く）
void navigator.storage?.persist?.().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
