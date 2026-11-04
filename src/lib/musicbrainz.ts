export interface SearchResult {
  title: string
  artist: string
  coverUrl: string
  genre: string | null
  year: number | null
  source: 'musicbrainz'
  sourceId: string | null
}

interface MBGroup {
  id: string
  title?: string
  'primary-type'?: string
  'first-release-date'?: string
  'artist-credit'?: { name?: string }[]
  score?: number // 検索語との一致度（0–100）
  count?: number // この盤の版の数（再発・各国盤）。よく出回っている盤ほど多い
}

// 一致度が同じなら版の多い盤を上に（無名の同名盤より、Radiohead の The Bends が先に来るように）
const rank = (g: MBGroup) => (g.score ?? 0) + 6 * Math.log2(1 + (g.count ?? 0))

/**
 * 検索は MusicBrainz。正式名をロケールで日本語化せず（英語の正規表記のまま）、
 * カタログが網羅的（iTunes が取りこぼす Frank Ocean の channel ORANGE 等も出る）。
 * API は CORS 対応なので fetch で直接叩ける。打ちながら検索するので signal で前の要求を打ち切る。
 * ジャケットは Cover Art Archive（CORS 許可あり → canvas 色抽出が通る）。未登録なら 404 →
 * AlbumCover が題名だけのスリーブを出す。
 */
export async function searchAlbums(term: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const q = term.trim()
  if (!q) return []
  const url =
    `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(q)}` +
    `&fmt=json&limit=25`
  const res = await fetchWithRetry(url, signal)
  if (!res.ok) throw new Error(`musicbrainz ${res.status}`)
  const data = (await res.json()) as { 'release-groups'?: MBGroup[] }
  const groups = Array.isArray(data['release-groups']) ? data['release-groups'] : []

  return groups
    .filter((g) => g['primary-type'] === 'Album' || g['primary-type'] === 'EP')
    .sort((a, b) => rank(b) - rank(a))
    .map((g): SearchResult => {
      const y = Number(String(g['first-release-date'] ?? '').slice(0, 4))
      return {
        title: g.title ?? '',
        artist: (g['artist-credit'] ?? [])[0]?.name ?? '',
        coverUrl: `https://coverartarchive.org/release-group/${g.id}/front-500`,
        genre: null,
        year: Number.isFinite(y) && y > 0 ? y : null,
        source: 'musicbrainz',
        sourceId: g.id ?? null,
      }
    })
    .filter((r) => r.title && r.artist)
}

// MusicBrainz は混み合うと 503 や 429 を返す（CORS ヘッダが付かず fetch ごと失敗することもある）。
// 約 1.2 秒、2.4 秒と間を空けて二度まで取り直す（少しばらして、皆で同時に叩き直さない）。打ち切られた要求は待たない。
const RETRY_WAITS = [1200, 2400]
const busy = (status: number) => status === 429 || status === 502 || status === 503 || status === 504

async function fetchWithRetry(url: string, signal?: AbortSignal): Promise<Response> {
  const init: RequestInit = { headers: { Accept: 'application/json' }, signal }
  for (const ms of RETRY_WAITS) {
    try {
      const res = await fetch(url, init)
      if (!busy(res.status)) return res
    } catch (e) {
      if (signal?.aborted) throw e
    }
    await wait(ms + Math.random() * 400, signal)
  }
  return fetch(url, init)
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(signal.reason)
      },
      { once: true },
    )
  })
}
