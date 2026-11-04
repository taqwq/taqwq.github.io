import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import type { Album } from '../types'
import { useWallMetrics } from '../lib/useWallMetrics'
import { useMediaQuery } from '../lib/media'
import { isModalOpen, useChromePin } from '../lib/chrome'
import { getShelfScroll, openAlbum, setShelfScroll, tileOf, wasOpenedByKey } from '../lib/vt'
import AlbumTile from '../components/AlbumTile'
import AddButton from '../components/AddButton'
import AddAlbum from '../components/AddAlbum'

/**
 * 棚（ホーム）。ジャケが継ぎ目だけを挟んで並ぶ壁。
 * スマホは3列で上から。タブレット/PC は窓に合わせて列が増え、壁が収まるときは部屋の中央に掛かる。
 * 枚数は壁の終わりに小さく添える（上には何も置かない）。
 */
export default function Shelf() {
  const albums = useStore((s) => s.albums)
  const navigate = useNavigate()
  const [addOpen, setAddOpen] = useState(false)
  const [focusIndex, setFocusIndex] = useState(0)
  const mainRef = useRef<HTMLElement>(null)

  const n = albums.length
  const { cols, tile } = useWallMetrics(mainRef, n > 0)
  const roomy = useMediaQuery('(min-width: 40rem)')
  // 少ない棚は、タイルを大きくせず満杯の壁と同じ大きさのまま中央に掛ける（一枚足しても他が縮まない）
  const sparse = roomy && n < cols
  const rowLength = sparse ? n : cols
  const focused = Math.min(focusIndex, Math.max(0, n - 1))

  useChromePin(n === 0, 'empty')

  // 詳細から戻ったら: 前のスクロール位置へ → 開いていた盤が画面外なら中央へ → 次の Tab はその盤から。
  // フォーカスそのものを戻すのはキーボードで開いたときだけ（マウスで開いて Esc で戻ると、盤に枠が残ってしまう）
  useLayoutEffect(() => {
    window.scrollTo(0, getShelfScroll())
    const id = useStore.getState().activeCoverId
    const el = id ? tileOf(id) : null
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.bottom <= 0 || r.top >= window.innerHeight) el.scrollIntoView({ block: 'center' })
    setFocusIndex(Math.max(0, useStore.getState().albums.findIndex((a) => a.id === id)))
    if (wasOpenedByKey()) el.focus({ preventScroll: true })
  }, [])

  // / と Ctrl/⌘+K で追加（日本語入力中は / が変換に入るので Ctrl+K が効く）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.key === 'Process' || isModalOpen()) return
      if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable="true"]')) return
      const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey
      const k = e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey
      if (!slash && !k) return
      e.preventDefault()
      setAddOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const closeAdd = useCallback(() => setAddOpen(false), [])
  const onAdded = useCallback((album: Album) => {
    // パネルが棚を覆っているうちに先頭へ。閉じたら新しい一枚にフォーカス
    // （閉じる更新を同期で確定させ、背後の inert が外れてから。後回しにすると inert のまま空振りする）
    setShelfScroll(0)
    window.scrollTo(0, 0)
    flushSync(() => setAddOpen(false))
    tileOf(album.id)?.focus({ preventScroll: true })
  }, [])
  const view = useCallback((id: string, byKey: boolean) => openAlbum(navigate, id, byKey), [navigate])

  // 壁はひとつの Tab 位置。中は矢印で動く（←→ 1枚、↑↓ 1段、Home/End 段の端、Ctrl+Home/End 最初と最後）
  const onWallKey = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    if (e.altKey || e.metaKey || e.shiftKey) return
    // 今フォーカスしている盤から数える（state は次の描画まで古いことがある）
    const here = (e.target as HTMLElement).closest<HTMLElement>('[data-album]')?.dataset.album
    const found = albums.findIndex((a) => a.id === here)
    const i = found >= 0 ? found : focused
    const lastRow = Math.floor((n - 1) / rowLength)
    let j: number | null = null
    if (e.ctrlKey) {
      if (e.key === 'Home') j = 0
      else if (e.key === 'End') j = n - 1
    } else if (e.key === 'ArrowRight') j = i + 1
    else if (e.key === 'ArrowLeft') j = i - 1
    else if (e.key === 'ArrowDown') j = Math.floor(i / rowLength) < lastRow ? Math.min(n - 1, i + rowLength) : i
    else if (e.key === 'ArrowUp') j = i - rowLength >= 0 ? i - rowLength : i
    else if (e.key === 'Home') j = i - (i % rowLength)
    else if (e.key === 'End') j = Math.min(n - 1, i - (i % rowLength) + rowLength - 1)
    if (j === null) return
    e.preventDefault()
    j = Math.max(0, Math.min(n - 1, j))
    setFocusIndex(j)
    tileOf(albums[j].id)?.focus()
  }

  // 空の棚と壁のどちらでも同じ一つ（key を付けないと、最初の一枚を足した瞬間に作り直されて退場の動きが飛ぶ）
  const addAlbum = (
    <AddAlbum key="add" open={addOpen} onClose={closeAdd} onAdded={onAdded} onView={view} />
  )

  if (n === 0) {
    return (
      <>
        <EmptyShelf onAdd={() => setAddOpen(true)} />
        {addAlbum}
      </>
    )
  }

  return (
    <>
      <main
        ref={mainRef}
        className="flex min-h-dvh flex-col pt-[calc(env(safe-area-inset-top)+20px)] pr-[max(var(--mat),env(safe-area-inset-right))] pb-[calc(env(safe-area-inset-bottom)+var(--foot))] pl-[max(var(--mat),env(safe-area-inset-left))] sm:pt-8 lg:py-[var(--mat)]"
      >
        <h1 className="sr-only">Your shelf</h1>
        {/* 壁の入れ物。追加の鍵の sticky はこの中で効くので、ここと祖先に overflow を付けない */}
        <div className={`relative sm:my-auto ${sparse ? 'self-center' : ''}`}>
          <ul
            role="list"
            aria-label="Albums"
            onKeyDown={onWallKey}
            className="grid gap-[var(--seam)]"
            style={{
              gridTemplateColumns: sparse ? `repeat(${n}, ${tile}px)` : `repeat(${cols}, minmax(0, 1fr))`,
            }}
          >
            {albums.map((a, i) => (
              <li key={a.id}>
                <AlbumTile
                  album={a}
                  eager={i < cols * 2}
                  tabIndex={i === focused ? 0 : -1}
                  onFocus={() => setFocusIndex(i)}
                />
              </li>
            ))}
          </ul>
          {/* 壁の終わりの小さな奥付。スマホ/タブレットでは同じ行の右端に追加の鍵が収まる */}
          <p className="chrome mt-6 text-[13px] leading-5 font-[450] text-ink-3 tabular-nums sm:mt-7 lg:mt-8">
            {n} {n === 1 ? 'album' : 'albums'}
          </p>
          <AddButton onClick={() => setAddOpen(true)} />
        </div>
      </main>

      {addAlbum}
    </>
  )
}

function EmptyShelf({ onAdd }: { onAdd: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-[var(--mat)] pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+8dvh)] text-center">
      {/* 見出しとボタンだけ。ボタンの言葉を言い換える説明文は置かない */}
      <h1 className="text-[16px] font-medium text-ink-1">Your shelf is empty</h1>
      <button
        type="button"
        onClick={onAdd}
        aria-keyshortcuts="/ Control+K Meta+K"
        className="mt-6 flex h-12 items-center rounded-[2px] border border-rule px-5 text-[15px] font-medium text-ink-1 transition hover:border-ink-3 active:scale-[0.98]"
      >
        Find an album
      </button>
    </main>
  )
}
