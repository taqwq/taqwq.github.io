import { useEffect } from 'react'

/*
 * 放置で操作UI（.chrome / .chrome-fine を付けた要素）を引く。
 * React は再描画せず、<html data-chrome="awake|idle|waking"> だけを書き換える。見た目は index.css。
 *
 *   awake  … 操作中。タイマーが進む
 *   idle   … 時間切れ。操作UIは透明になり、押せない（下のジャケに指が届く）
 *   waking … 隠れている最中に押された。見せるが、指が離れて少し経つまで押せない
 *            （iOS は指を離した位置で当たり判定をし直すので、起こしたタップが＋に化けないように）
 *
 * スクショの修飾キー（Win+Shift+S / ⌘⇧4 など）では起こさない。撮る瞬間に操作UIが戻ってこない。
 */

type State = 'awake' | 'idle' | 'waking'

const IDLE_MS = 3000 // マウス・キーボードのあと
const IDLE_TOUCH_MS = 4000 // タッチのあと
const GRACE_MS = 4000 // 起動直後・画面遷移直後・モーダルを閉じた直後は必ず見せておく
const SETTLE_MS = 350 // waking から押せるようになるまでの最短
const MOVE_PX = 6 // これ未満のマウスの揺れでは起こさない

const SILENT_KEYS = new Set([
  'Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'OS', 'CapsLock', 'Fn', 'FnLock',
  'Hyper', 'Super', 'Symbol', 'NumLock', 'ScrollLock', 'PrintScreen', 'Unidentified',
])

let started = false
let state: State = 'awake'
let timer = 0
let settleTimer = 0
let graceUntil = 0
let lastWasTouch = false
let pointersDown = 0
let wakingAt = 0
let hovering = false
let focused = false
let mx = Number.NaN
let my = Number.NaN
const pins = new Map<string, number>()

function setState(next: State) {
  if (state === next) return
  state = next
  document.documentElement.dataset.chrome = next
}

// 押さえている理由が一つでもあれば隠さない（解けたときに arm し直す）
function holding(): boolean {
  return pins.size > 0 || pointersDown > 0 || hovering || focused
}

function arm() {
  window.clearTimeout(timer)
  if (holding()) return
  const wait = Math.max(lastWasTouch ? IDLE_TOUCH_MS : IDLE_MS, graceUntil - performance.now())
  timer = window.setTimeout(() => {
    if (!holding()) setState('idle')
  }, wait)
}

function wake(touch: boolean) {
  lastWasTouch = touch
  if (state === 'idle') setState('awake')
  arm()
}

function settle() {
  window.clearTimeout(settleTimer)
  const wait = Math.max(100, wakingAt + SETTLE_MS - performance.now())
  settleTimer = window.setTimeout(() => {
    if (state !== 'waking' || pointersDown > 0) return // 次の pointerup がまた呼ぶ
    setState('awake')
    arm()
  }, wait)
}

const isChrome = (t: EventTarget | null) =>
  t instanceof Element && t.closest('.chrome, .chrome-fine') !== null

function onPointerDown(e: PointerEvent) {
  pointersDown++
  lastWasTouch = e.pointerType === 'touch'
  if (state === 'idle') {
    setState('waking')
    wakingAt = performance.now()
  }
  arm()
}

function onPointerUp() {
  pointersDown = Math.max(0, pointersDown - 1)
  if (state === 'waking') settle()
  arm()
}

function onPointerMove(e: PointerEvent) {
  if (e.pointerType === 'touch') return // 指の移動はスクロールが拾う
  if (!Number.isNaN(mx) && Math.hypot(e.clientX - mx, e.clientY - my) < MOVE_PX) return
  mx = e.clientX
  my = e.clientY
  wake(false)
}

function onPointerOver(e: PointerEvent) {
  if (e.pointerType === 'touch') return
  const on = isChrome(e.target)
  if (on === hovering) return
  hovering = on
  arm()
}

function onPointerOut(e: PointerEvent) {
  if (e.relatedTarget !== null || !hovering) return // 窓の外へ出たときだけ
  hovering = false
  arm()
}

function onKeyDown(e: KeyboardEvent) {
  if (SILENT_KEYS.has(e.key)) return
  wake(false)
}

function onFocusIn(e: FocusEvent) {
  if (!isChrome(e.target)) return
  // マウスで押した＋にフォーカスが残っても押さえない。キーボードで来たときだけ
  focused = (e.target as Element).matches(':focus-visible')
  wake(lastWasTouch)
}

function onFocusOut() {
  if (!focused) return
  focused = false
  arm()
}

function onWindowBlur() {
  pointersDown = 0
  hovering = false
  arm()
}

/** 一度だけ。AppShell から呼ぶ。 */
export function startChrome() {
  if (started) return
  started = true
  document.documentElement.dataset.chrome = state
  graceUntil = performance.now() + GRACE_MS

  const opt = { capture: true, passive: true } as const
  window.addEventListener('pointerdown', onPointerDown, opt)
  window.addEventListener('pointerup', onPointerUp, opt)
  window.addEventListener('pointercancel', onPointerUp, opt)
  window.addEventListener('pointermove', onPointerMove, opt)
  window.addEventListener('pointerover', onPointerOver, opt)
  window.addEventListener('pointerout', onPointerOut, opt)
  window.addEventListener('wheel', () => wake(false), opt)
  window.addEventListener('scroll', () => wake(lastWasTouch), opt)
  window.addEventListener('keydown', onKeyDown, opt)
  window.addEventListener('focusin', onFocusIn, opt)
  window.addEventListener('focusout', onFocusOut, opt)
  window.addEventListener('blur', onWindowBlur) // capture にすると要素の blur まで拾うので付けない
  arm()
}

/** しばらく必ず見せる（画面遷移の直後など）。 */
export function graceChrome(ms = GRACE_MS) {
  graceUntil = Math.max(graceUntil, performance.now() + ms)
  if (state === 'idle') setState('awake')
  arm()
}

/** 隠さない理由を登録する。返り値で解除。'modal' が全部外れたら猶予を置いてから数え直す。 */
export function pinChrome(reason: string): () => void {
  pins.set(reason, (pins.get(reason) ?? 0) + 1)
  if (state === 'idle') setState('awake')
  arm()
  let released = false
  return () => {
    if (released) return
    released = true
    const n = (pins.get(reason) ?? 1) - 1
    if (n > 0) pins.set(reason, n)
    else pins.delete(reason)
    if (reason === 'modal' && !pins.has('modal')) graceChrome()
    else arm()
  }
}

export function useChromePin(active: boolean, reason: string) {
  useEffect(() => (active ? pinChrome(reason) : undefined), [active, reason])
}

/** シート・パレット・確認ダイアログのどれかが開いているか（グローバルのキー操作はこのとき無視する） */
export function isModalOpen(): boolean {
  return pins.has('modal')
}
