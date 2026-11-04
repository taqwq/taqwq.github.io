import { useCallback, useEffect, useRef, useState } from 'react'
import { searchAlbums, type SearchResult } from './musicbrainz'
import { extractColor, FALLBACK_COLOR } from './color'
import { useStore } from '../store'
import type { Album } from '../types'

// busy = つながっているのに失敗した（MusicBrainz が混んでいる）。error = 端末がオフライン
export type SearchStatus = 'idle' | 'searching' | 'empty' | 'busy' | 'error'

const DEBOUNCE_MS = 450
const MIN_CHARS = 2
const MIN_GAP_MS = 1200 // MusicBrainz の約束は「1秒に1回を超えない」。ちょうど 1 秒だと上限に乗るので少し空ける

/** 既に棚にある盤か。MusicBrainz の id で、無ければ題名＋作家名で照合する。 */
export function findOnShelf(albums: Album[], r: SearchResult): Album | undefined {
  const title = r.title.toLowerCase()
  const artist = r.artist.toLowerCase()
  return albums.find(
    (a) =>
      (r.sourceId !== null && a.sourceId === r.sourceId) ||
      (a.title.toLowerCase() === title && a.artist.toLowerCase() === artist),
  )
}

/**
 * 追加の手順（検索 → 一枚選ぶ → 星とひとこと → 棚へ）の状態。シートとパレットで共有するので、
 * 窓の幅が 640px をまたいでも打ちかけの検索や選んだ盤が消えない。
 */
export function useAlbumSearch() {
  const albums = useStore((s) => s.albums)
  const addAlbum = useStore((s) => s.addAlbum)

  const [query, setQuery] = useState('')
  const [composing, setComposing] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [resultsFor, setResultsFor] = useState('') // いま見えている結果の検索語
  const [pendingFor, setPendingFor] = useState('')
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [active, setActive] = useState(0)

  const [picked, setPicked] = useState<SearchResult | null>(null)
  const [color, setColor] = useState<string | null>(null)
  const [rating, setRating] = useState(0)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const seq = useRef(0)
  const pickSeq = useRef(0)
  const ctrl = useRef<AbortController | null>(null)
  const lastStart = useRef(Number.NEGATIVE_INFINITY)
  const gapTimer = useRef(0)
  const shownStatus = useRef<SearchStatus>('idle') // いま見えている結果に対応する状態

  const cancel = useCallback(() => {
    seq.current++
    ctrl.current?.abort()
    window.clearTimeout(gapTimer.current)
  }, [])

  const search = useCallback((raw: string) => {
    const term = raw.trim()
    window.clearTimeout(gapTimer.current)
    if (!term) return
    setPendingFor(term)
    const wait = lastStart.current + MIN_GAP_MS - performance.now()
    if (wait > 0) {
      gapTimer.current = window.setTimeout(() => search(term), wait)
      return
    }
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    const mine = ++seq.current
    lastStart.current = performance.now()
    setStatus('searching') // 前の結果は残したまま
    searchAlbums(term, c.signal).then(
      (items) => {
        if (mine !== seq.current) return
        const next: SearchStatus = items.length ? 'idle' : 'empty'
        shownStatus.current = next
        setResults(items)
        setResultsFor(term)
        setActive(0)
        setStatus(next)
      },
      () => {
        if (mine !== seq.current || c.signal.aborted) return
        const failed: SearchStatus = navigator.onLine ? 'busy' : 'error'
        shownStatus.current = failed
        setResults([]) // 別の語の古い結果を見せ続けない
        setResultsFor(term)
        setStatus(failed)
      },
    )
  }, [])

  // 打ちながら検索（IME の変換中は待つ）
  useEffect(() => {
    if (composing) return
    const term = query.trim()
    if (!term) {
      cancel()
      shownStatus.current = 'idle'
      setResults([])
      setResultsFor('')
      setPendingFor('')
      setStatus('idle')
      return
    }
    if (term.length < MIN_CHARS || term === resultsFor) {
      // 打ち直して今の結果の語に戻った（または短くなった）。走っている／待っている別の語の要求は捨てる
      // （捨てないと、戻った語の下に別の語の「No results」が一瞬出る）
      if (pendingFor !== resultsFor) {
        cancel()
        setPendingFor(resultsFor)
        setStatus(shownStatus.current)
      }
      return
    }
    if (term === pendingFor) return
    const t = window.setTimeout(() => search(term), DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [query, composing, resultsFor, pendingFor, search, cancel])

  /** Enter。結果が今の語より古ければすぐ検索して true。新しければ false（呼び出し側が選択行を選ぶ）。 */
  const submit = useCallback((): boolean => {
    const term = query.trim()
    if (!term) return true
    if (status === 'searching' && term === pendingFor) return true
    if (term !== resultsFor || status === 'error' || status === 'busy') {
      search(term)
      return true
    }
    return false
  }, [query, status, pendingFor, resultsFor, search])

  const pick = useCallback((r: SearchResult) => {
    const mine = ++pickSeq.current
    setPicked(r)
    setRating(0)
    setNote('')
    setColor(null)
    void extractColor(r.coverUrl).then((c) => {
      if (mine === pickSeq.current) setColor(c)
    })
  }, [])

  const unpick = useCallback(() => {
    pickSeq.current++
    setPicked(null)
    setColor(null)
  }, [])

  /** 棚へ足す。色の抽出が失敗していたら取り直してから焼き付ける。 */
  const confirm = useCallback(async (): Promise<Album | null> => {
    if (!picked || saving) return null
    if (findOnShelf(useStore.getState().albums, picked)) return null
    setSaving(true)
    let c = color
    if (!c || c === FALLBACK_COLOR) c = await extractColor(picked.coverUrl)
    return addAlbum({
      title: picked.title,
      artist: picked.artist,
      coverUrl: picked.coverUrl,
      coverColor: c,
      rating,
      genre: picked.genre,
      note: note.trim(),
      year: picked.year,
      source: picked.source,
      sourceId: picked.sourceId,
    })
  }, [picked, saving, color, rating, note, addAlbum])

  const reset = useCallback(() => {
    cancel()
    pickSeq.current++
    shownStatus.current = 'idle'
    setQuery('')
    setComposing(false)
    setResults([])
    setResultsFor('')
    setPendingFor('')
    setStatus('idle')
    setActive(0)
    setPicked(null)
    setColor(null)
    setRating(0)
    setNote('')
    setSaving(false)
  }, [cancel])

  const onShelf = useCallback((r: SearchResult) => findOnShelf(albums, r), [albums])

  return {
    query, setQuery, setComposing,
    results, status, active, setActive, submit,
    picked, pick, unpick, onShelf,
    color, rating, setRating, note, setNote, saving, confirm,
    reset,
  }
}

export type AlbumSearch = ReturnType<typeof useAlbumSearch>
