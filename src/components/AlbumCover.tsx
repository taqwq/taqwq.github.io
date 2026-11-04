import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { coverSrc, isCoverLoaded, markCoverLoaded } from '../lib/covers'

type Variant = 'tile' | 'hero' | 'thumb'

const RETRY_MS = 1500

/**
 * ジャケット画像。
 *   tile  … 棚・追加画面。保存した URL をそのまま使う（詳細のヒーローが同じ URL を同期で受け取れるように）
 *   hero  … 詳細。下に棚と同じ画像（滑走の最初のフレームから写る）、上に高解像度を重ねて静かに差し替える
 *   thumb … 検索結果。読み込み中も失敗も、黒い四角ではなく薄い枠の面
 * 画像が無い/読めないときは、題名と作家名だけを組んだスリーブを出す（代表色のベタ塗りはしない）。
 * Cover Art Archive はリダイレクトの途中でたまに落ちるので、棚と詳細は一度だけ取り直してから諦める。
 */
export default function AlbumCover({
  src,
  title,
  artist,
  variant = 'tile',
  eager = false,
  className = '',
  style,
}: {
  src: string
  title: string
  artist: string
  variant?: Variant
  eager?: boolean
  className?: string
  style?: CSSProperties
}) {
  const url = variant === 'thumb' ? coverSrc(src, 250) : src
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0) // 0 = 一回目 / 1 = 取り直し待ち / 2 = 取り直し
  const [loaded, setLoaded] = useState(() => isCoverLoaded(url))
  const [hiLoaded, setHiLoaded] = useState(false)
  const [hiFailed, setHiFailed] = useState(false)
  const [shownUrl, setShownUrl] = useState(url)
  const imgRef = useRef<HTMLImageElement>(null)

  // 同じ要素のまま別の盤になったら、読み込み状態を最初から
  if (url !== shownUrl) {
    setShownUrl(url)
    setFailed(false)
    setAttempt(0)
    setLoaded(isCoverLoaded(url))
    setHiLoaded(false)
    setHiFailed(false)
  }

  // HTTP キャッシュから同期で読めていた画像は、フェードを待たずに出す
  useLayoutEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth > 0) setLoaded(true)
  }, [url, attempt])

  useEffect(() => {
    if (attempt !== 1) return
    const t = window.setTimeout(() => setAttempt(2), RETRY_MS)
    return () => window.clearTimeout(t)
  }, [attempt])

  const onLoad = () => {
    setLoaded(true)
    if (variant !== 'thumb') markCoverLoaded(url)
  }
  const onError = () => {
    if (variant !== 'thumb' && attempt === 0) setAttempt(1) // 待つあいだは面だけ見せる
    else setFailed(true)
  }
  const fade: CSSProperties = { opacity: loaded ? 1 : 0, transition: 'opacity 200ms ease-out' }

  if (variant === 'thumb') {
    return (
      <div
        className={`relative aspect-square overflow-hidden rounded-[2px] bg-[rgba(237,230,220,0.06)] shadow-[inset_0_0_0_1px_rgba(237,230,220,0.08)] ${className}`}
        style={style}
      >
        {url && !failed && (
          <img
            ref={imgRef}
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={onLoad}
            onError={onError}
            className="size-full object-cover"
            style={fade}
          />
        )}
      </div>
    )
  }

  const hiSrc = coverSrc(url, 1200)
  const withHi = variant === 'hero' && hiSrc !== url && !hiFailed && !failed && attempt !== 1

  return (
    <div className={`@container relative aspect-square overflow-hidden bg-surface ${className}`} style={style}>
      {url && !failed ? (
        attempt !== 1 && (
          <img
            key={attempt}
            ref={imgRef}
            src={url}
            alt={variant === 'hero' ? `${title} cover` : ''}
            loading={eager || variant === 'hero' ? 'eager' : 'lazy'}
            decoding={variant === 'hero' ? 'sync' : 'async'}
            fetchPriority={eager || variant === 'hero' ? 'high' : 'auto'}
            onLoad={onLoad}
            onError={onError}
            className="absolute inset-0 size-full object-cover"
            style={fade}
          />
        )
      ) : (
        <Sleeve title={title} artist={artist} />
      )}
      {withHi && (
        <img
          src={hiSrc}
          srcSet={`${coverSrc(url, 500)} 500w, ${hiSrc} 1200w`}
          sizes="(min-width: 64rem) 720px, (min-width: 40rem) 560px, 100vw"
          alt=""
          aria-hidden
          decoding="async"
          onLoad={() => setHiLoaded(true)}
          onError={() => setHiFailed(true)}
          className="absolute inset-0 size-full object-cover"
          style={{ opacity: hiLoaded ? 1 : 0, transition: 'opacity 200ms ease-out' }}
        />
      )}
    </div>
  )
}

/**
 * ジャケの無い盤。作家名と題名だけを、盤の大きさに合わせて左上に組む（イニシャルやアイコンは置かない）。
 * 並びはラベルや検索結果と同じ「作家 → 題名」（詳細で隣のラベルと逆順に並ばないように）。
 * 棚ではボタンの中にあるので、継承する中央揃えを text-left で打ち消す（詳細と同じ組みにして、滑走で文字が跳ねない）。
 */
function Sleeve({ title, artist }: { title: string; artist: string }) {
  return (
    <div
      role="img"
      aria-label={`${title}, ${artist}`}
      className="absolute inset-0 bg-surface p-[8%] text-left text-[clamp(11px,7.5cqi,28px)] leading-[1.2]"
    >
      <p className="line-clamp-2 text-[0.85em] text-ink-3 [overflow-wrap:anywhere]">{artist}</p>
      <p className="mt-[0.3em] line-clamp-4 font-medium text-ink-2 [overflow-wrap:anywhere]">{title}</p>
    </div>
  )
}
