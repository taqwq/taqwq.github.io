export const SCHEMA_VERSION = 1

export type AlbumSource = 'itunes' | 'musicbrainz' | 'manual'

export interface Album {
  id: string
  title: string
  artist: string
  coverUrl: string
  coverColor: string // "#RRGGBB" 追加時に一度だけ抽出してキャッシュした代表色
  rating: number // 0–5 の整数
  genre: string | null
  note: string
  year: number | null
  source: AlbumSource
  sourceId: string | null // iTunes collectionId 等（再取得/重複判定用）
  createdAt: number
  updatedAt: number
}

export interface ReplayStore {
  schemaVersion: number
  albums: Album[]
}
