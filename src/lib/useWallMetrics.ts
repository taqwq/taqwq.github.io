import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'

export interface WallMetrics {
  cols: number
  tile: number // px
}

// 前回の測定値。棚へ戻った最初の描画から正しい列数で組み、スクロール位置の復元をずらさない
let last: WallMetrics = { cols: 3, tile: 0 }

/**
 * 壁の列数とタイル幅。スマホは3列固定、それ以外は窓に合わせて増やす（Apple Music と同じ考え方）。
 * cols = clamp(3, floor((C + seam) / (tile-min + seam)), 10)。トークンは index.css の :root。
 */
export function useWallMetrics(ref: RefObject<HTMLElement | null>, enabled: boolean): WallMetrics {
  const [metrics, setMetrics] = useState(last)

  useLayoutEffect(() => {
    const el = ref.current
    if (!enabled || !el) return
    const measure = () => {
      const cs = getComputedStyle(el)
      const width = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const seam = parseFloat(cs.getPropertyValue('--seam')) || 0
      const tileMin = parseFloat(cs.getPropertyValue('--tile-min')) || 0
      const fixed = parseInt(cs.getPropertyValue('--cols-fixed'), 10) || 0
      const cols = fixed || Math.min(10, Math.max(3, Math.floor((width + seam) / (tileMin + seam))))
      const next = { cols, tile: Math.max(0, (width - (cols - 1) * seam) / cols) }
      last = next
      setMetrics((prev) => (prev.cols === next.cols && Math.abs(prev.tile - next.tile) < 0.05 ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, enabled])

  return metrics
}
