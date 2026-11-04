import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

const STAR =
  'M12 2.6l2.7 6.2 6.7.6-5.1 4.5 1.5 6.6L12 17l-5.8 3.5 1.5-6.6L2.6 9.4l6.7-.6L12 2.6z'

const fill = (on: boolean) => (on ? 'var(--cover-accent)' : 'var(--color-star-empty)')

/**
 * 星の入力。星28px・タップ領域44px を隙間なく並べる。同じ星をもう一度押すと0に戻せる。
 * 塗りは開いた盤の色（--cover-accent）、空は star-empty。
 * マウスでは指した位置まで仮に灯す。キーボードは radiogroup の作法（←→ / Home / End）。
 * 星の“絵”はタップ領域の左端から 11px 内側にあるので、左揃えの文脈では親が -ml-[11px] を足す。
 */
export function StarRating({
  value,
  onChange,
  className = '',
}: {
  value: number
  onChange: (v: number) => void
  className?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const shown = hover ?? value

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowUp' ? Math.min(5, value + 1)
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? Math.max(0, value - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? 5
      : null
    if (next === null) return
    e.preventDefault()
    onChange(next)
    refs.current[Math.max(0, next - 1)]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label="Rating"
      onKeyDown={onKeyDown}
      onPointerLeave={() => setHover(null)}
      className={`flex items-center ${className}`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          ref={(el) => {
            refs.current[n - 1] = el
          }}
          type="button"
          role="radio"
          aria-checked={n === value}
          aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
          tabIndex={n === (value || 1) ? 0 : -1}
          // 押し直しで0に戻すのはポインタだけ。キーボードの Enter/Space（detail=0）は選んだ星を確定させるだけ
          onClick={(e) => onChange(n === value && e.detail > 0 ? 0 : n)}
          onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(n)}
          className="grid size-11 place-items-center transition-transform duration-[120ms] active:scale-90"
        >
          <svg width={28} height={28} viewBox="0 0 24 24" aria-hidden>
            <path d={STAR} fill={fill(n <= shown)} className="transition-[fill] duration-[120ms]" />
          </svg>
        </button>
      ))}
    </div>
  )
}
