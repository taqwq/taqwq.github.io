// ジャケットから代表色を一度だけ抽出してキャッシュする。
// 32px へ縮小 → 暗すぎ/明るすぎ/無彩を除いた画素の平均を取り、
// 黒い舞台でも沈まないよう彩度・明度をクランプして hex で返す。

const cache = new Map<string, string>()
export const FALLBACK_COLOR = '#F2EFE9' // 無彩・抽出失敗時は中立の暖オフホワイト

export async function extractColor(url: string): Promise<string> {
  return (await extractColorOrNull(url)) ?? FALLBACK_COLOR
}

/**
 * 読めなかった（タイムアウト/CORS/404）ときは null。失敗はキャッシュせず、次の呼び出しで取り直せる。
 * 保存済みの色を直すか決めるときは、失敗（null）と「白黒なので中立色」（FALLBACK_COLOR）を区別したいのでこちらを使う。
 */
export async function extractColorOrNull(url: string): Promise<string | null> {
  if (!url) return null
  const hit = cache.get(url)
  if (hit) return hit

  const color = await new Promise<string | null>((resolve) => {
    const img = new Image()
    setTimeout(() => resolve(null), 2500) // 画像がハングしても「Adding…」で固まらせない
    img.crossOrigin = 'anonymous' // Cover Art Archive は CORS を許すので canvas が汚染されない
    img.onload = () => {
      try {
        const size = 32
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)

        let r = 0, g = 0, b = 0, n = 0
        let fr = 0, fg = 0, fb = 0, fn = 0 // フォールバック（全画素平均）
        for (let i = 0; i < data.length; i += 4) {
          const pr = data[i], pg = data[i + 1], pb = data[i + 2]
          fr += pr; fg += pg; fb += pb; fn++
          const max = Math.max(pr, pg, pb)
          const min = Math.min(pr, pg, pb)
          const luma = 0.299 * pr + 0.587 * pg + 0.114 * pb
          if (luma < 40 || luma > 225 || max - min < 24) continue
          r += pr; g += pg; b += pb; n++
        }

        if (n > 12) return resolve(clampForBlack(r / n, g / n, b / n))
        // 色のある画素がほとんど無い（白黒のジャケ）。全体の平均にも色が無ければ、色を足さずに中立の明色へ。
        // clampForBlack に通すと無彩の色相 0（赤）に彩度の下限が掛かり、ジャケに無いバラ色になる
        if (fn === 0) return resolve(FALLBACK_COLOR)
        const [, s] = rgbToHsl(fr / fn, fg / fn, fb / fn)
        resolve(s >= 0.1 ? clampForBlack(fr / fn, fg / fn, fb / fn) : FALLBACK_COLOR)
      } catch {
        resolve(null) // CORS で読めなかった等
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })

  if (color) cache.set(url, color)
  return color
}

const STAGE: [number, number, number] = [7, 6, 5] // #070605

function relLuminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrastVsStage(rgb: [number, number, number]): number {
  const a = relLuminance(rgb)
  const b = relLuminance(STAGE)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

// 黒い舞台で星・罫・本文に流用するので、実コントラスト 4.5:1 を満たすまで明度を上げる。
// HSL のクランプだけでは青/紫/赤の低輝度ヒューが黒地で沈むため（それが前版の穴だった）。
function clampForBlack(r: number, g: number, b: number): string {
  const [h, s0, l0] = rgbToHsl(r, g, b)
  const s = Math.min(0.72, Math.max(0.2, s0))
  let l = Math.min(0.82, Math.max(0.54, l0))
  let rgb = hslToRgb(h, s, l) as [number, number, number]
  let guard = 0
  while (contrastVsStage(rgb) < 4.5 && l < 0.95 && guard++ < 24) {
    l += 0.03
    rgb = hslToRgb(h, s, l) as [number, number, number]
  }
  return rgbToHex(rgb[0], rgb[1], rgb[2])
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return [h, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}
