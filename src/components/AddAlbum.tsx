import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { useAlbumSearch, type AlbumSearch } from '../lib/useAlbumSearch'
import type { SearchResult } from '../lib/musicbrainz'
import { useMediaQuery } from '../lib/media'
import { useModal } from '../lib/modal'
import type { Album } from '../types'
import AlbumCover from './AlbumCover'
import { StarRating } from './Stars'

type Phase = 'enter' | 'open' | 'leave'

const SHEET_EXIT_MS = 360
const PALETTE_EXIT_MS = 150

const coarse = () => window.matchMedia('(pointer: coarse)').matches

/**
 * アルバムを足す。検索 → 一枚選ぶ → 星とひとこと → 棚へ。
 * スマホは下からせり上がるシート、タブレット/PC は画面の上寄りに出るパレット。手順と状態は共有する。
 */
export default function AddAlbum({
  open,
  onClose,
  onAdded,
  onView,
}: {
  open: boolean
  onClose: () => void
  onAdded: (album: Album) => void
  onView: (id: string, byKey: boolean) => void // 既に棚にある盤を開く
}) {
  const wide = useMediaQuery('(min-width: 40rem)')
  const s = useAlbumSearch()
  const { reset, unpick, picked } = s
  const [mounted, setMounted] = useState(open)
  const [phase, setPhase] = useState<Phase>('enter')
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollActive = useRef(false) // ↑↓で動かしたときだけ見える位置へ（マウスで指しただけでは一覧を動かさない）
  const listId = useId()
  useModal(open)

  // 開く: マウントして、次のフレームで入場
  useEffect(() => {
    if (!open) return
    setMounted(true)
    setPhase('enter')
    const raf = requestAnimationFrame(() => setPhase('open'))
    return () => cancelAnimationFrame(raf)
  }, [open])

  // 閉じる: 退場を待ってからアンマウントし、打ちかけの状態を捨てる
  useEffect(() => {
    if (open || !mounted) return
    setPhase('leave')
    const t = window.setTimeout(
      () => {
        setMounted(false)
        reset()
      },
      wide ? PALETTE_EXIT_MS : SHEET_EXIT_MS,
    )
    return () => window.clearTimeout(t)
  }, [open, mounted, wide, reset])

  // シートはせり上がりきってから（途中でキーボードが出ると動きが崩れる）
  useEffect(() => {
    if (!open || !mounted) return
    const t = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), wide ? 0 : 160)
    return () => window.clearTimeout(t)
  }, [open, mounted, wide])

  // 背後の棚をスクロールさせない
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const backToResults = useCallback(() => {
    unpick()
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
  }, [unpick])

  // Esc: 追加の手順なら結果へ戻る、結果なら閉じる
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented) return
      e.preventDefault()
      if (picked) backToResults()
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, picked, backToResults, onClose])

  // 選んでいる行を見える位置に。動かすのは ↑↓ のとき・結果が入れ替わったとき・追加の手順から戻ったときだけ
  // （マウスで指しただけでは一覧を動かさない。入れ替わった結果は先頭が見えるように）
  const seen = useRef({ results: s.results, picked })
  useEffect(() => {
    const replaced = seen.current.results !== s.results
    const moved = scrollActive.current || replaced || seen.current.picked !== picked
    seen.current = { results: s.results, picked }
    scrollActive.current = false
    if (!wide || picked || !moved) return
    // 入れ替わった結果は一覧の頭から（行の上の余白ごと戻す）。それ以外は選んでいる行が見えるところまで
    if (replaced && s.active === 0) document.getElementById(listId)?.parentElement?.scrollTo({ top: 0 })
    else document.getElementById(`${listId}-${s.active}`)?.scrollIntoView({ block: 'nearest' })
  }, [wide, picked, s.results, s.active, listId])

  const choose = (r: SearchResult) => {
    s.pick(r)
    if (coarse()) inputRef.current?.blur()
  }

  const add = async () => {
    const album = await s.confirm()
    if (album) onAdded(album)
  }

  const view = (id: string, byKey: boolean) => {
    // 退場を待たずに消してから開く（パネルごとスナップショットに写らないように）
    flushSync(() => {
      setMounted(false)
      onClose()
    })
    reset()
    onView(id, byKey)
  }

  const onInputKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    // IME の確定 Enter では検索しない（Safari は keyCode 229 で来る）
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    const n = s.results.length
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!n) return
      e.preventDefault()
      const next = Math.max(0, Math.min(n - 1, s.active + (e.key === 'ArrowDown' ? 1 : -1)))
      if (next !== s.active) {
        scrollActive.current = true
        s.setActive(next)
      }
      return
    }
    if (e.key !== 'Enter') return
    e.preventDefault()
    const searched = s.submit()
    if (!searched && wide && s.results[s.active]) choose(s.results[s.active])
    // タッチ端末はキーボードを畳んで結果を見せる
    if (coarse()) e.currentTarget.blur()
  }

  if (!mounted) return null

  const props: PaneProps = { s, phase, inputRef, listId, onInputKey, choose, add, view, backToResults, onClose }
  return createPortal(wide ? <Palette {...props} /> : <Sheet {...props} />, document.body)
}

interface PaneProps {
  s: AlbumSearch
  phase: Phase
  inputRef: RefObject<HTMLInputElement | null>
  listId: string
  onInputKey: (e: ReactKeyboardEvent<HTMLInputElement>) => void
  choose: (r: SearchResult) => void
  add: () => void
  view: (id: string, byKey: boolean) => void
  backToResults: () => void
  onClose: () => void
}

function statusText(s: AlbumSearch): string {
  if (s.results.length) return ''
  if (s.status === 'searching') return 'Searching…'
  if (s.status === 'empty') return 'No results'
  if (s.status === 'busy') return 'MusicBrainz is busy. Try again in a moment.'
  if (s.status === 'error') return 'Couldn’t search. Check your connection and try again.'
  return ''
}

const accentOf = (s: AlbumSearch): CSSProperties =>
  s.color ? ({ '--cover-accent': s.color } as CSSProperties) : {}

/* ── タブレット / PC: 上寄りのパレット ─────────────────────────────── */

function Palette(p: PaneProps) {
  const { s, phase } = p
  const shown = phase === 'open'
  const status = statusText(s)
  const panelRef = useRef<HTMLElement>(null)

  // PC: 追加の鍵の上辺（= 壁の一段目の上辺）の高さに開く。64px〜24dvh に収める。鍵の無い空の棚とタブレットは既定のまま
  useLayoutEffect(() => {
    const el = panelRef.current
    const key = document.querySelector('[data-add-key]')
    if (!el || !key || !window.matchMedia('(min-width: 64rem)').matches) return
    const top = Math.max(64, Math.min(key.getBoundingClientRect().top, window.innerHeight * 0.24))
    el.style.setProperty('--palette-top', `${Math.round(top)}px`)
  }, [])
  const scrim: CSSProperties = {
    opacity: shown ? 1 : 0,
    transition: shown ? 'opacity 200ms ease-out' : 'opacity 150ms ease-in',
  }
  const panel: CSSProperties = {
    ...accentOf(s),
    opacity: shown ? 1 : 0,
    transform: shown ? 'none' : `translateY(${phase === 'leave' ? -4 : -8}px)`,
    transition: shown
      ? 'opacity 220ms var(--ease-record), transform 220ms var(--ease-record)'
      : 'opacity 150ms ease-in, transform 150ms ease-in',
  }

  return (
    <div data-modal className="fixed inset-0 z-50">
      <div aria-hidden onClick={p.onClose} className="absolute inset-0 bg-stage/72" style={scrim} />
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add album"
        className="absolute inset-x-0 top-[var(--palette-top,max(64px,12dvh))] mx-auto flex max-h-[calc(100dvh-var(--palette-top,max(64px,12dvh))-48px)] w-[min(640px,calc(100%-2*var(--mat)))] flex-col overflow-hidden rounded-[2px] border border-rule bg-surface"
        style={panel}
      >
        {s.picked ? (
          <PaletteAddStep {...p} picked={s.picked} />
        ) : (
          <div className="fade-in flex min-h-0 flex-col">
            <div className="flex h-14 shrink-0 items-center">
              <SearchInput
                {...p}
                className="h-full min-w-0 flex-1 bg-transparent pl-5 text-[17px] leading-6 text-ink-1 outline-none placeholder:text-ink-3"
              />
              <button
                type="button"
                onClick={p.onClose}
                className="h-full shrink-0 px-5 text-[13px] text-ink-3 transition-colors hover:text-ink-1"
              >
                Close
              </button>
            </div>
            {(s.results.length > 0 || status) && (
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-rule">
                {s.results.length > 0 ? (
                  <ResultList {...p} variant="palette" />
                ) : (
                  <p role="status" aria-live="polite" className="px-5 py-6 text-[13px] leading-5 text-ink-3">
                    {status}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function PaletteAddStep({ s, picked, add, view, backToResults }: PaneProps & { picked: SearchResult }) {
  const dup = s.onShelf(picked)
  const ref = useRef<HTMLDivElement>(null)
  // 検索欄が消えるので、フォーカスを手順そのものへ移す（枠は出さない。次の Tab で星へ）
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [])
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="fade-in overflow-y-auto overscroll-contain p-6 outline-none"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !dup) {
          e.preventDefault()
          add()
        }
      }}
    >
      <div className="grid grid-cols-[200px_minmax(0,1fr)] gap-6">
        <AlbumCover src={picked.coverUrl} title={picked.title} artist={picked.artist} eager className="rounded-[2px]" />
        <div>
          {/* 作家名の字面の上端をジャケの上辺に揃える */}
          <p className="-mt-1 truncate text-[13px] leading-[18px] text-ink-2">{picked.artist}</p>
          <p className="mt-1.5 line-clamp-3 text-[22px] leading-7 font-medium tracking-[-0.01em] text-ink-1 [overflow-wrap:anywhere]">
            {picked.title}
          </p>
          {(dup || picked.year != null) && (
            <p className="mt-1 text-[13px] leading-5 text-ink-3 tabular-nums">
              {dup ? 'On your shelf' : picked.year}
            </p>
          )}
          {!dup && (
            <>
              <StarRating value={s.rating} onChange={s.setRating} className="-ml-[11px] mt-4" />
              <NoteField value={s.note} onChange={s.setNote} className="mt-1" />
            </>
          )}
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={backToResults}
          className="h-10 px-3 text-[14px] text-ink-3 transition-colors hover:text-ink-1"
        >
          Back
        </button>
        {dup ? (
          <button
            type="button"
            onClick={(e) => view(dup.id, e.detail === 0)}
            className="h-10 rounded-[2px] border border-rule px-4 text-[14px] font-medium text-ink-1 transition-colors hover:border-ink-3"
          >
            View album
          </button>
        ) : (
          <button
            type="button"
            onClick={add}
            disabled={s.saving}
            className="h-10 rounded-[2px] bg-ink-1 px-4 text-[14px] font-medium text-stage transition active:scale-[0.98] disabled:opacity-50"
          >
            {s.saving ? 'Adding…' : 'Add to shelf'}
          </button>
        )}
      </div>
    </div>
  )
}

/* ── スマホ: 下からせり上がるシート ──────────────────────────────── */

function Sheet(p: PaneProps) {
  const { s, phase } = p
  const shown = phase === 'open'
  const status = statusText(s)
  const sheet: CSSProperties = {
    ...accentOf(s),
    paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)',
    transform: shown ? 'translateY(0%)' : 'translateY(100%)',
    transition: 'transform 360ms var(--ease-record)',
  }

  return (
    <div data-modal className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        aria-hidden
        onClick={p.onClose}
        className="absolute inset-0 bg-stage/70"
        style={{ opacity: shown ? 1 : 0, transition: 'opacity 300ms ease-out' }}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Add album"
        className="relative h-[88dvh] w-full overflow-y-auto overscroll-contain bg-surface"
        style={sheet}
      >
        {/* 舞台から切り出す唯一の線 */}
        <div className="sticky top-0 z-10 bg-surface">
          <div className="h-px w-full bg-rule" />
          {/* 検索語と Close はベースラインで揃える（中央揃えだと下線のぶん Close が下がる） */}
          <div className="flex items-baseline gap-3 px-5 py-4">
            {/* 16px 未満だと iOS がフォーカス時に画面をズームする */}
            <SearchInput
              {...p}
              className="min-w-0 flex-1 border-b border-rule bg-transparent pb-2 text-[16px] text-ink-1 outline-none transition-colors placeholder:text-ink-3 focus:border-ink-2"
            />
            <button
              type="button"
              onClick={p.onClose}
              className="-mr-1 min-h-[44px] shrink-0 px-1 text-[14px] font-[450] text-ink-3 transition hover:text-ink-1"
            >
              Close
            </button>
          </div>
        </div>

        {!s.picked ? (
          <div className="px-3 pb-6">
            {status && (
              <p role="status" aria-live="polite" className="px-2 py-8 text-center text-[13px] leading-[1.6] text-ink-3">
                {status}
              </p>
            )}
            {s.results.length > 0 && <ResultList {...p} variant="sheet" />}
          </div>
        ) : (
          <SheetAddStep {...p} picked={s.picked} />
        )}
      </section>
    </div>
  )
}

function SheetAddStep({ s, picked, add, view, backToResults }: PaneProps & { picked: SearchResult }) {
  const dup = s.onShelf(picked)
  return (
    <div className="px-5 pb-6">
      <div className="mx-auto mt-3 w-44">
        <AlbumCover src={picked.coverUrl} title={picked.title} artist={picked.artist} eager className="rounded-[2px]" />
      </div>

      <div className="mt-5 text-center">
        <p className="text-[15px] text-ink-2 [overflow-wrap:anywhere]">{picked.artist}</p>
        <p className="text-[20px] leading-tight font-medium tracking-[-0.005em] text-ink-1 [overflow-wrap:anywhere]">
          {picked.title}
        </p>
        {dup && <p className="mt-1.5 text-[13px] text-ink-3">On your shelf</p>}
      </div>

      {!dup && (
        <>
          <div className="mt-6 flex justify-center">
            <StarRating value={s.rating} onChange={s.setRating} />
          </div>
          <NoteField value={s.note} onChange={s.setNote} className="mt-6" />
        </>
      )}

      <div className="mt-6 flex items-center justify-between">
        {/* 押し幅の余白ぶん左へ出して、文字を本文と同じ左端に置く */}
        <button
          type="button"
          onClick={backToResults}
          className="-ml-1 min-h-[44px] px-1 text-[14px] font-[450] text-ink-3 transition hover:text-ink-1"
        >
          Back
        </button>
        {dup ? (
          <button
            type="button"
            onClick={(e) => view(dup.id, e.detail === 0)}
            className="flex h-12 items-center rounded-[2px] border border-rule px-6 text-[15px] font-medium text-ink-1 transition active:scale-[0.98]"
          >
            View album
          </button>
        ) : (
          <button
            type="button"
            onClick={add}
            disabled={s.saving}
            className="flex h-12 items-center rounded-[2px] bg-ink-1 px-6 text-[15px] font-medium text-stage transition active:scale-[0.98] disabled:opacity-50"
          >
            {s.saving ? 'Adding…' : 'Add to shelf'}
          </button>
        )}
      </div>
    </div>
  )
}

/* ── 共有部品 ───────────────────────────────────────────────── */

function SearchInput({ s, inputRef, listId, onInputKey, className }: PaneProps & { className: string }) {
  const hasResults = s.results.length > 0 && !s.picked
  return (
    <input
      ref={inputRef}
      value={s.query}
      onChange={(e) => s.setQuery(e.target.value)}
      onCompositionStart={() => s.setComposing(true)}
      onCompositionEnd={() => s.setComposing(false)}
      onKeyDown={onInputKey}
      role="combobox"
      aria-expanded={hasResults}
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={hasResults ? `${listId}-${s.active}` : undefined}
      placeholder="Search albums"
      aria-label="Search albums"
      enterKeyHint="search"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck={false}
      className={className}
    />
  )
}

function ResultList({ s, listId, choose, variant }: PaneProps & { variant: 'palette' | 'sheet' }) {
  const palette = variant === 'palette'
  return (
    <ul id={listId} role="listbox" aria-label="Results" className={palette ? 'p-2' : ''}>
      {s.results.map((r, i) => {
        const active = palette && i === s.active
        return (
          <li
            key={`${r.sourceId}-${i}`}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === s.active}
            onPointerMove={(e) => palette && e.pointerType === 'mouse' && s.setActive(i)}
            onClick={() => choose(r)}
            className={
              palette
                ? `flex h-16 cursor-pointer items-center gap-3.5 rounded-[2px] px-3 ${active ? 'bg-[rgba(237,230,220,0.06)]' : ''}`
                : 'flex cursor-pointer items-center gap-3 rounded-[2px] px-2 py-2 transition-colors active:bg-[rgba(237,230,220,0.06)]'
            }
          >
            <AlbumCover
              variant="thumb"
              src={r.coverUrl}
              title={r.title}
              artist={r.artist}
              className={palette ? 'w-12 shrink-0' : 'w-14 shrink-0'}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] leading-[18px] text-ink-2">{r.artist}</p>
              <p className="truncate text-[15px] leading-5 font-medium text-ink-1">{r.title}</p>
            </div>
            <span className="shrink-0 text-[13px] text-ink-3 tabular-nums">
              {s.onShelf(r) ? 'On your shelf' : r.year}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** ひとことメモ。枠なしで本文と同じ左端、下に一本の線。1〜4行まで伸び、それ以上はスクロール。 */
function NoteField({
  value,
  onChange,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  // field-sizing 未対応のブラウザ（一部の Safari）でも中身の高さに追従させる
  // （scrollHeight は下線の 1px を含まないので足す。足さないと 1px だけスクロールできてしまう）
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || CSS.supports('field-sizing', 'content')) return
    el.style.height = 'auto'
    const border = el.offsetHeight - el.clientHeight
    el.style.height = `${Math.min(el.scrollHeight + border, 111)}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={1}
      placeholder="Add a note"
      aria-label="Note"
      spellCheck={false}
      autoCorrect="off"
      className={`block max-h-[111px] w-full resize-none overflow-y-auto border-b border-rule bg-transparent pb-1.5 text-[16px] leading-[26px] text-ink-1 caret-[var(--cover-accent)] outline-none transition-colors field-sizing-content placeholder:text-ink-3 focus:border-ink-2 ${className}`}
    />
  )
}
