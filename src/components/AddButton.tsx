/**
 * 追加の鍵。Shelf が壁の入れ物の最後（奥付の後）に置く。形と置き場所は index.css の「追加の鍵」。
 * スマホ/タブレット: 壁の途中は親指の届く右下で待ち、壁の終わりで奥付の行の右端に収まる。
 * PC: 壁の右上の角の外の余白。上辺は壁の一段目の上辺で、スクロールしても余白に留まる。
 * 放置で消える（.chrome）。タッチでは隠れている間も押し当たりを残し（.add-disc）、そのタップは鍵を呼び戻すだけ。
 */
export default function AddButton({ onClick }: { onClick: () => void }) {
  const press = () => {
    // タッチで、隠れていた（または呼び戻している最中の）鍵が押されたときは開かない
    const shown = document.documentElement.dataset.chrome === 'awake'
    if (!shown && window.matchMedia('(pointer: coarse)').matches) return
    onClick()
  }

  return (
    <div className="add-row">
      <div className="add-mount chrome add-disc">
        <button
          type="button"
          data-add-key
          onClick={press}
          aria-label="Add album"
          aria-haspopup="dialog"
          aria-keyshortcuts="/ Control+K Meta+K"
          className="add-key"
        >
          <span className="add-plus" aria-hidden />
        </button>
      </div>
    </div>
  )
}
