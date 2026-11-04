/*
 * ジャケ画像の URL まわり。
 * Cover Art Archive は 307→302 のリダイレクトを毎回たどる（キャッシュされない）ので、
 * 一度読めた URL は Image を握っておく。握っている間は、同じ URL の新しい <img> が
 * 同期的に complete になる——棚→詳細の滑走の最初のフレームからジャケが写る。
 */

const MAX_HELD = 400
const held = new Map<string, HTMLImageElement>() // 挿入順 = 古い順（LRU）

/** CAA の front-500 → front-N、iTunes の 600x600bb → NxNbb。それ以外はそのまま。 */
export function coverSrc(url: string, size: 250 | 500 | 1200): string {
  if (!url) return url
  if (url.includes('coverartarchive.org')) return url.replace(/front(-\d+)?$/, `front-${size}`)
  if (url.includes('600x600bb')) return url.replace('600x600bb', `${size}x${size}bb`)
  return url
}

export function isCoverLoaded(url: string): boolean {
  return held.has(url)
}

export function markCoverLoaded(url: string) {
  if (!url) return
  const hit = held.get(url)
  if (hit) {
    held.delete(url)
    held.set(url, hit)
    return
  }
  const img = new Image() // crossOrigin なし: <img> と同じ取得モードで揃える
  img.src = url
  held.set(url, img)
  if (held.size > MAX_HELD) {
    const oldest = held.keys().next().value
    if (oldest !== undefined) held.delete(oldest)
  }
}
