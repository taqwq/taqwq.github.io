import { flushSync } from 'react-dom'
import type { NavigateFunction } from 'react-router-dom'
import { useStore } from '../store'

/*
 * 棚↔詳細の遷移。共有要素トランジション（ジャケが滑走する）と、スクロール位置・履歴の扱いをまとめる。
 * View Transitions 非対応のブラウザでは普通に遷移する。
 */

interface ViewTransition {
  ready: Promise<void>
  finished: Promise<void>
}
type VTDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => ViewTransition
}

/** 詳細を棚から開いたかどうか。戻るときに履歴を一つ戻すか、棚へ置き換えるかを決める。 */
export interface DetailState {
  fromShelf?: boolean
}

let shelfScrollY = 0
export const getShelfScroll = () => shelfScrollY
export const setShelfScroll = (y: number) => {
  shelfScrollY = y
}

// キーボード（Enter/Space）で開いたか。戻ったとき、そのときだけ盤にフォーカスを戻す
// （マウスで開いて Esc で戻った人に、キーボード扱いの枠を残さない）
let openedByKey = false
export const wasOpenedByKey = () => openedByKey

function transition(update: () => void | Promise<void>): ViewTransition | null {
  const doc = document as VTDocument
  if (typeof doc.startViewTransition !== 'function') {
    void update()
    return null
  }
  const t = doc.startViewTransition(update)
  // 連打で前の遷移が打ち切られたときの reject をコンソールに出さない
  t.ready.catch(() => {})
  t.finished.catch(() => {})
  return t
}

export function tileOf(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-album="${CSS.escape(id)}"]`)
}

/** 棚の一枚を開く。見えているタイルからだけジャケを滑らせる（画面外からは飛んでこない）。 */
export function openAlbum(navigate: NavigateFunction, id: string, byKey = false) {
  shelfScrollY = window.scrollY
  openedByKey = byKey
  const r = tileOf(id)?.getBoundingClientRect()
  const visible = !!r && r.bottom > 0 && r.top < window.innerHeight
  // 古いスナップショットに view-transition-name が乗るよう、先に DOM へ反映しておく
  flushSync(() => useStore.getState().setActiveCover(visible ? id : null))
  const state: DetailState = { fromShelf: true }
  transition(() => flushSync(() => navigate(`/album/${id}`, { state })))
}

/**
 * 棚へ戻る。棚から来たなら履歴を一つ戻す（マウスの戻るボタンや iOS のスワイプと同じ履歴になる）。
 * popstate で確定した DOM を新しい状態として撮らせる。直リンクで来たなら棚に置き換える。
 */
export function backToShelf(navigate: NavigateFunction, fromShelf: boolean) {
  if (!fromShelf) {
    transition(() => flushSync(() => navigate('/', { replace: true })))
    return
  }
  // 非対応ブラウザでも transition() がこの関数をそのまま走らせる（history.back() は一度だけ）
  transition(
    () =>
      new Promise<void>((resolve) => {
        let timeout = 0
        const done = () => {
          window.removeEventListener('popstate', onPop)
          window.clearTimeout(timeout)
          resolve()
        }
        // Router の popstate リスナーが先に setState 済み。popstate は React の離散イベント扱いなので flushSync で確定する
        const onPop = () => {
          flushSync(() => {})
          done()
        }
        timeout = window.setTimeout(done, 1000)
        window.addEventListener('popstate', onPop)
        history.back()
      }),
  )
}

/** 詳細のまま隣の盤へ（←→）。履歴は増やさず、同じ場所で短くクロスフェードする。 */
export function flipAlbum(navigate: NavigateFunction, id: string, state: DetailState | null) {
  const html = document.documentElement
  html.classList.add('vt-flip')
  const done = () => html.classList.remove('vt-flip')
  const t = transition(() => flushSync(() => navigate(`/album/${id}`, { replace: true, state })))
  if (t) t.finished.then(done, done)
  else done()
}
