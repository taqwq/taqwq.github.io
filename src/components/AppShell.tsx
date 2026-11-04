import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { graceChrome, startChrome } from '../lib/chrome'

/**
 * 部屋そのもの。幅や余白は各画面が持つ（棚は窓いっぱいの壁、詳細はスマホで縦積み・PCで見開き）。
 * ここは放置フェードの起動と、画面が替わるたびの猶予だけを受け持つ。
 * モーダルは body 直下へ portal し、開いている間この #app-content を inert にする。
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const { key } = useLocation()

  useEffect(() => {
    // スクロール位置は棚が自分で戻す（ブラウザ任せだと棚の位置が詳細へ漏れる）
    history.scrollRestoration = 'manual'
    startChrome()
  }, [])

  useEffect(() => {
    graceChrome()
  }, [key])

  return (
    <div id="app-content" className="relative min-h-dvh">
      {children}
    </div>
  )
}
