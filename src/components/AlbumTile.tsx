import { useNavigate } from 'react-router-dom'
import type { Album } from '../types'
import { useStore } from '../store'
import { openAlbum } from '../lib/vt'
import { coverVtName } from '../lib/vt-name'
import AlbumCover from './AlbumCover'

/** 棚に並ぶスリーブ一枚。ラベルも影もカードも無い——色はジャケ自身が持つ。 */
export default function AlbumTile({
  album,
  eager,
  tabIndex,
  onFocus,
}: {
  album: Album
  eager?: boolean
  tabIndex: number
  onFocus: () => void
}) {
  const navigate = useNavigate()
  // 動かすのは“いま開く一枚”だけ。全タイルに名前を付けると他が一斉にフェードして散らかる。
  const active = useStore((s) => s.activeCoverId === album.id)

  return (
    <button
      type="button"
      data-album={album.id}
      aria-label={`${album.title}, ${album.artist}`}
      tabIndex={tabIndex}
      onFocus={onFocus}
      onClick={(e) => openAlbum(navigate, album.id, e.detail === 0)}
      className="tile block w-full scroll-my-[var(--mat)] rounded-[2px]"
    >
      <AlbumCover
        src={album.coverUrl}
        title={album.title}
        artist={album.artist}
        eager={eager}
        className="rounded-[2px]"
        style={active ? { viewTransitionName: coverVtName(album.id) } : undefined}
      />
    </button>
  )
}
