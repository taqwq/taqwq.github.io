import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { SCHEMA_VERSION, type Album } from './types'

const KEY = 'replay:v1'

type NewAlbum = Omit<Album, 'id' | 'createdAt' | 'updatedAt'>

// crypto.randomUUID は安全なコンテキスト(HTTPS/localhost)にしか生えない。
// LAN の http（実機確認）でも追加が落ちないよう、getRandomValues で v4 を組む。
function uid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

interface State {
  albums: Album[]
  activeCoverId: string | null // 共有要素トランジションで“動かす”ジャケの id
  setActiveCover: (id: string | null) => void
  addAlbum: (input: NewAlbum) => Album
  updateAlbum: (id: string, patch: Partial<Album>) => void
  deleteAlbum: (id: string) => void
}

let writeTimer: number | undefined
let lastWrite: { name: string; value: string } | null = null

function flushWrite() {
  if (writeTimer !== undefined) {
    clearTimeout(writeTimer)
    writeTimer = undefined
  }
  if (!lastWrite) return
  try {
    localStorage.setItem(lastWrite.name, lastWrite.value)
  } catch (e) {
    // 容量超過など。インメモリ状態は正しいので画面は動くが、永続化は失敗している。
    console.warn('[replay] 保存に失敗（容量超過の可能性）', e)
  }
  lastWrite = null
}

// タブを閉じる/隠す直前に未書き込みを確定させる（デバウンス中の消失を防ぐ）
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushWrite)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushWrite()
  })
}

/**
 * localStorage を安全に包む。
 * 読み: 壊れていたら退避キーに逃がして空で起動（黙って捨てない）。
 * 書き: 容量超過などは握りつぶして warn（アプリは落とさない。トーストは後で）。
 */
const safeStorage = {
  getItem: (name: string): string | null => {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(name)
    } catch {
      return null
    }
    if (raw == null) return null
    try {
      JSON.parse(raw)
      return raw
    } catch {
      try {
        localStorage.setItem(`${name}:corrupt:${Date.now()}`, raw)
        localStorage.removeItem(name)
      } catch {
        /* noop */
      }
      return null
    }
  },
  setItem: (name: string, value: string): void => {
    // 書き込みはデバウンス（星スライド/メモ連打で毎回同期書きしない）
    lastWrite = { name, value }
    if (writeTimer !== undefined) clearTimeout(writeTimer)
    writeTimer = setTimeout(flushWrite, 400) as unknown as number
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(name)
    } catch {
      /* noop */
    }
  },
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      albums: [],
      activeCoverId: null,
      setActiveCover: (id) => set({ activeCoverId: id }),
      addAlbum: (input) => {
        const album: Album = {
          ...input,
          id: uid(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        // 新しいものを先頭に（棚は追加順の降順＝聴き込んだ順）
        set({ albums: [album, ...get().albums] })
        return album
      },
      updateAlbum: (id, patch) => {
        set({
          albums: get().albums.map((a) =>
            a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a,
          ),
        })
      },
      deleteAlbum: (id) => {
        set({ albums: get().albums.filter((a) => a.id !== id) })
      },
    }),
    {
      name: KEY,
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ albums: s.albums }), // 永続化するのは albums だけ（UI状態は除く）
      // 将来のスキーマ変更はここで 1→2→3 と連鎖させる。いまは最小の防御だけ。
      migrate: (persisted: unknown) => {
        const p = persisted as Partial<State> | undefined
        if (!p || !Array.isArray(p.albums)) return { albums: [] } as unknown as State
        return p as State
      },
      // 毎ロード走る。壊れた/id・titleを欠くレコードは捨て、欠損フィールドは既定で埋める。
      merge: (persisted, current) => {
        const p = persisted as { albums?: unknown } | undefined
        const raw = Array.isArray(p?.albums) ? (p!.albums as unknown[]) : []
        const albums = raw
          .filter(
            (a): a is Partial<Album> & Pick<Album, 'id' | 'title'> =>
              !!a && typeof (a as Album).id === 'string' && typeof (a as Album).title === 'string',
          )
          .map(
            (a): Album => ({
              coverUrl: '',
              coverColor: '#F2EFE9',
              rating: 0,
              note: '',
              genre: null,
              year: null,
              artist: '',
              source: 'manual',
              sourceId: null,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              ...a,
            }),
          )
        return { ...(current as State), albums }
      },
    },
  ),
)
