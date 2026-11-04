import { useEffect } from 'react'
import { useChromePin } from './chrome'

/**
 * モーダルを開いている間: 背後(#app-content)を inert にして Tab と読み上げを閉じ込め、操作UIを隠さない。
 * 閉じたら、キーボードで開いたときだけ開いた場所へフォーカスを戻す。マウスで開いたなら
 * フォーカスを外す（戻すと Chrome がキーボード扱いの枠を描き、操作UIが消えなくなる）。
 * モーダルの根には data-modal を付けておく。
 *
 * useLayoutEffect にしないこと: その後片付けは DOM 更新の途中で走り、直後に React 自身が
 * 「コミット前にフォーカスしていた要素（モーダルの入力欄）」へフォーカスを戻してしまう。
 */
export function useModal(open: boolean) {
  useChromePin(open, 'modal')

  useEffect(() => {
    if (!open) return
    const app = document.getElementById('app-content')
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const restore = prev !== null && prev !== document.body && prev.matches(':focus-visible')
    app?.setAttribute('inert', '')
    return () => {
      app?.removeAttribute('inert')
      const now = document.activeElement
      const stranded = !now || now === document.body || now.closest('[data-modal]') !== null
      if (!stranded) return // 呼び出し側が別の場所へ移した
      if (restore && prev?.isConnected) prev.focus({ preventScroll: true })
      else if (now instanceof HTMLElement && now !== document.body) now.blur()
    }
  }, [open])
}
