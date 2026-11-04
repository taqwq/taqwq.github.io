import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import type { Album } from '../types'
import { backToShelf, flipAlbum, type DetailState } from '../lib/vt'
import { coverVtName } from '../lib/vt-name'
import { isModalOpen } from '../lib/chrome'
import { extractColorOrNull, FALLBACK_COLOR } from '../lib/color'
import AlbumCover from '../components/AlbumCover'
import { StarRating } from '../components/Stars'
import ConfirmDialog from '../components/ConfirmDialog'

/**
 * 一枚の盤と、その壁のラベル。
 * スマホ/タブレット/低い窓: 上から ジャケ → 作家 → 題名 → 年 → 星 → メモ → 追加日と削除。
 * PC: 左にジャケ、右にラベル。作家名の字面の上端がジャケの上辺に、「Added」のベースラインが下辺に乗る。
 * 罫線・字下げ・表組みは使わない。左端は一本（戻るの矢印の先・星の一つ目の先もそこに揃える）。
 */
export default function AlbumDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? null) as DetailState | null
  const fromShelf = state?.fromShelf === true

  const album = useStore((s) => s.albums.find((a) => a.id === id))
  const updateAlbum = useStore((s) => s.updateAlbum)
  const deleteAlbum = useStore((s) => s.deleteAlbum)
  const setActiveCover = useStore((s) => s.setActiveCover)

  const [bloom, setBloom] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const deleting = useRef(false)
  const lastAlbum = useRef<Album | undefined>(album)
  if (album) lastAlbum.current = album
  // 削除して棚へ戻るまでの一瞬も、消えた盤のまま見せておく（真っ黒な一コマを出さない）
  const a = album ?? (deleting.current ? lastAlbum.current : undefined)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  // 開いた盤は先頭から（棚のスクロール位置を持ち込まない）
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [id])

  // field-sizing 未対応のブラウザ（一部の Safari）でも、メモ欄を中身の高さに追従させる
  // （scrollHeight は下線の 1px を含まないので足す。足さないと最後の 1px が切れる）
  useLayoutEffect(() => {
    const el = noteRef.current
    if (!el || CSS.supports('field-sizing', 'content')) return
    el.style.height = 'auto'
    const border = el.offsetHeight - el.clientHeight
    el.style.height = `${el.scrollHeight + border}px`
  }, [a?.note])

  // 盤ごとに一度だけ（ノート編集の再レンダーで走らせない）
  useEffect(() => {
    if (!id) return
    setActiveCover(id)
    const t = setTimeout(() => setBloom(true), 60)
    return () => clearTimeout(t)
  }, [id, setActiveCover])

  // 保存した色を直す: 追加のとき抽出に失敗していた（中立色のまま）か、白黒のジャケに架空の色が付いていたら取り直す。
  // それ以外の色は触らない（抽出は決定的なので、同じジャケからは同じ色が出る）
  const coverUrl = album?.coverUrl
  useEffect(() => {
    if (!id || !coverUrl) return
    let alive = true
    void extractColorOrNull(coverUrl).then((c) => {
      const stored = useStore.getState().albums.find((x) => x.id === id)?.coverColor
      if (!alive || !c || !stored || c === stored) return
      if (c === FALLBACK_COLOR || stored === FALLBACK_COLOR) updateAlbum(id, { coverColor: c })
    })
    return () => {
      alive = false
    }
  }, [id, coverUrl, updateAlbum])

  useEffect(() => {
    if (id && !album && !deleting.current) navigate('/', { replace: true })
  }, [id, album, navigate])

  useEffect(() => {
    if (a) document.title = `${a.title} – ${a.artist}`
  }, [a?.title, a?.artist]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      document.title = 'Replay'
    },
    [],
  )

  const back = useCallback(() => backToShelf(navigate, fromShelf), [navigate, fromShelf])

  // Esc で棚へ、←→ で棚の並びの隣の盤へ（入力中・修飾キー・長押し・モーダル中は何もしない）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.key === 'Process' || isModalOpen()) return
      if (e.key === 'Escape') {
        e.preventDefault()
        back()
        return
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat) return
      const t = e.target
      if (t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"], [role="radiogroup"]')) return
      const list = useStore.getState().albums
      const i = list.findIndex((x) => x.id === id)
      const j = e.key === 'ArrowLeft' ? i - 1 : i + 1
      if (i < 0 || j < 0 || j >= list.length) return
      e.preventDefault()
      flipAlbum(navigate, list[j].id, state)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, back, navigate, state])

  if (!a) return null

  const rootStyle = {
    '--cover-accent': a.coverColor,
    transition: '--cover-accent 400ms var(--ease-wash)',
  } as CSSProperties

  const remove = () => {
    deleting.current = true
    setConfirming(false)
    setActiveCover(null)
    deleteAlbum(a.id)
    if (fromShelf) history.back()
    else navigate('/', { replace: true })
  }

  return (
    <div className="detail relative min-h-dvh" style={rootStyle}>
      {/* wall-wash: 開いた盤の色が天井からにじみ、黒へ落ちる（列ではなく部屋いっぱいに） */}
      <div
        aria-hidden
        className="wash pointer-events-none absolute inset-x-0 top-0 h-[62vh] split:h-dvh"
        style={{ opacity: bloom ? 1 : 0, transition: 'opacity 680ms var(--ease-wash)' }}
      >
        <div className="wash-color absolute inset-0" />
        <div className="wash-grain absolute inset-0" />
      </div>

      {/* 見開きでは戻るを部屋の左上の余白へ。main はコンテナ（fixed の基準になる）なので外に置く */}
      <div className="chrome-fine fixed top-[calc((var(--mat)-40px)/2)] left-[calc((var(--mat)-40px)/2)] z-20 hidden split:block">
        <BackButton onClick={back} className="size-10" />
      </div>

      <main className="relative z-10 pr-[max(var(--mat),env(safe-area-inset-right))] pb-[calc(env(safe-area-inset-bottom)+32px)] pl-[max(var(--mat),env(safe-area-inset-left))] split:grid split:min-h-dvh split:content-center split:px-[var(--mat)] split:py-[var(--V)] split:@container">
        <div className="detail-group mx-auto w-full sm:max-w-[560px] split:grid split:max-w-none split:grid-cols-[var(--S)_var(--P)] split:grid-rows-[var(--S)] split:justify-center split:gap-x-[var(--G)]">
          <div className="flex h-[calc(env(safe-area-inset-top)+48px)] items-center pt-[env(safe-area-inset-top)] sm:h-[calc(env(safe-area-inset-top)+56px)] split:hidden">
            {/* 矢印の先を左端に揃える（44px の押し幅の中で 19px 内側にある） */}
            <span className="chrome-fine -ml-[19px]">
              {/* 左へ 19px 出しているので、フォーカスの枠は内側に描く（外側だとスマホで画面の外に切れる） */}
              <BackButton onClick={back} className="size-11 focus-visible:outline-offset-[-2px]" />
            </span>
          </div>

          <AlbumCover
            key={`hero-${a.id}`}
            variant="hero"
            src={a.coverUrl}
            title={a.title}
            artist={a.artist}
            className="rounded-[2px]"
            style={{ viewTransitionName: coverVtName(a.id) }}
          />

          <div
            key={`placard-${a.id}`}
            className="placard fade-up split:flex split:min-h-[calc(var(--S)+40px)] split:flex-col split:pb-10"
          >
            {/* 見開きでは作家名の字面の上端をジャケの上辺に揃える（-5px） */}
            <p className="mt-6 text-[15px] leading-5 text-ink-2 [overflow-wrap:anywhere] sm:mt-7 sm:text-[16px] sm:leading-[22px] split:-mt-[5px]">
              {a.artist}
            </p>
            <h1 className="mt-1 text-[30px] leading-[34px] font-medium tracking-[-0.01em] text-ink-1 [overflow-wrap:anywhere] [text-wrap:balance] sm:mt-1.5 sm:text-[34px] sm:leading-[38px] sm:tracking-[-0.015em] split:mt-2.5 split:text-[36px] split:leading-10 split:wide:text-[40px] split:wide:leading-[44px]">
              {a.title}
            </h1>
            {a.year != null && (
              <p className="mt-2 text-[13px] leading-5 text-ink-3 tabular-nums split:mt-3">{a.year}</p>
            )}
            {a.genre && (
              <p className={`text-[13px] leading-5 text-ink-3 ${a.year != null ? '' : 'mt-2 split:mt-3'}`}>{a.genre}</p>
            )}

            {/* ここからは自分の記録 */}
            <StarRating
              value={a.rating}
              onChange={(v) => updateAlbum(a.id, { rating: v })}
              className="-ml-[11px] mt-4 split:mt-5"
            />
            <textarea
              ref={noteRef}
              value={a.note}
              onChange={(e) => updateAlbum(a.id, { note: e.target.value })}
              onKeyDown={(e) => {
                // Esc はまずメモから抜けるだけ（もう一度で棚へ）
                if (e.key !== 'Escape' || e.nativeEvent.isComposing) return
                e.preventDefault()
                e.currentTarget.blur()
              }}
              rows={1}
              placeholder="Add a note"
              aria-label="Note"
              // 盤名や曲名に赤い波線が残ると、放置しても絵にならない（ジャケに無い赤）。自動修正も名前を書き換えるので切る
              spellCheck={false}
              autoCorrect="off"
              className="note mt-1 block w-full max-w-[34em] resize-none overflow-hidden border-b border-transparent bg-transparent pb-1.5 text-[16px] leading-[26px] text-ink-1 caret-[var(--cover-accent)] outline-none transition-colors field-sizing-content placeholder:text-ink-3 focus:border-ink-3 split:max-w-none"
            />

            {/* 見開きでは「Added」のベースラインをジャケの下辺に乗せる（-5px） */}
            <footer className="mt-10 flex items-baseline justify-between text-[13px] leading-5 split:mt-auto split:-mb-[5px] split:pt-10">
              <p className="text-ink-3 tabular-nums">Added {formatDate(a.createdAt)}</p>
              <span className="chrome-fine">
                {/* 押し幅は ::before で広げる（padding で広げるとフォーカスの枠が左に偏る） */}
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="relative text-ink-3 transition-colors before:absolute before:-inset-y-3 before:right-0 before:-left-4 before:content-[''] hover:text-ink-1"
                >
                  Delete
                </button>
              </span>
            </footer>
          </div>
        </div>
      </main>

      <ConfirmDialog
        open={confirming}
        title="Delete this album?"
        description={`This removes “${a.title}” from this device. It can’t be undone.`}
        onCancel={() => setConfirming(false)}
        onConfirm={remove}
      />
    </div>
  )
}

function BackButton({ onClick, className }: { onClick: () => void; className: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Back to shelf"
      className={`grid place-items-center text-ink-2 transition-[color,transform] duration-150 hover:text-ink-1 active:scale-95 ${className}`}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="m15 18-6-6 6-6" />
      </svg>
    </button>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function formatDate(ms: number): string {
  const d = new Date(ms)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}
