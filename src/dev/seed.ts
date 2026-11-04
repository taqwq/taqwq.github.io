import { useStore } from '../store'
import type { Album } from '../types'

// 開発用の見本棚。URL に ?seed（全21枚）や ?seed=3（先頭3枚）、?seed=0（空）を付けると、
// この端末の棚を見本に差し替える。main.tsx から import.meta.env.DEV の時だけ読まれ、本番には入らない。

type Demo = [mbid: string, title: string, artist: string, year: number, color: string, rating: number, note: string]

const DEMO: Demo[] = [
  ['f8f4167d-897c-4b25-a171-638374d1dfa4', 'channel ORANGE', 'Frank Ocean', 2012, '#df7939', 5, 'Pyramids at 2am. Every time.'],
  ['08aa7a6c-3e43-4459-87b2-e47faf3a088a', 'Currents', 'Tame Impala', 2015, '#9e72a1', 4, 'Let It Happen on the night train home.'],
  ['6e335887-60ba-38f0-95af-fae7774336bf', 'In Rainbows', 'Radiohead', 2007, '#bb8459', 5, 'Weird Fishes is the one.'],
  ['0da340a0-6ad7-4fc2-a272-6f94393a7831', 'Blonde', 'Frank Ocean', 2016, '#b27b61', 5, 'Summer 2016 in one record.'],
  ['f1390eec-a192-4d96-9943-bbc42a819588', 'Bloom', 'Beach House', 2012, '#F2EFE9', 4, 'Myth, every winter.'],
  ['aa997ea0-2936-40bd-884d-3af8a0e064dc', 'Random Access Memories', 'Daft Punk', 2013, '#aba182', 4, ''],
  ['810272e0-aef1-3d85-b2d3-e512e87fc38c', 'Homogenic', 'Björk', 1997, '#8f8bb2', 5, 'Jóga with headphones and the lights off. Still the best way to hear it, twenty years on.'],
  ['d9103c72-3807-4378-9ce7-b6f3e8fdd547', 'To Pimp a Butterfly', 'Kendrick Lamar', 2015, '#F2EFE9', 5, ''],
  ['1646286a-d0ad-4288-bfab-34b0fb7b22c1', 'SOS', 'SZA', 2022, '#5b8db9', 3, ''],
  ['416bb5e5-c7d1-3977-8fd7-7c9daf6c2be6', 'Rumours', 'Fleetwood Mac', 1977, '#d2cfbb', 4, "Dad's record. Mine now."],
  ['187935b5-a0a4-3e6f-9684-48b67a5190a1', 'For Emma, Forever Ago', 'Bon Iver', 2007, '#F2EFE9', 4, 'Snowed in, 2019.'],
  ['f5093c06-23e3-404f-aeaa-40f72885ee3a', 'The Dark Side of the Moon', 'Pink Floyd', 1973, '#b79b5c', 0, ''],
  ['331a7ba1-fae2-4881-b434-554f46c13746', 'A Seat at the Table', 'Solange', 2016, '#728da1', 4, 'Cranes in the Sky.'],
  ['17d74d52-c92b-3b8d-9f87-218ab2d1c4a0', 'Music Has the Right to Children', 'Boards of Canada', 1998, '#60bebf', 5, 'Sounds like an old photograph.'],
  ['a348ba2f-f8b3-4686-b928-e63d8d94d543', 'AM', 'Arctic Monkeys', 2013, '#F2EFE9', 0, ''],
  ['b0bf2b77-b8cf-32f6-8893-9741d757b400', 'Moon Safari', 'Air', 1998, '#aca582', 4, 'Sunday mornings.'],
  ['efea26d1-a016-30f6-b8e2-bc8c02336b0a', 'Is This It', 'The Strokes', 2001, '#d6cec2', 4, ''],
  ['18564a20-d557-4f7c-81e7-8d1d40a1be55', 'Be the Cowboy', 'Mitski', 2018, '#bc8f80', 4, 'Nobody, loud.'],
  ['e4a67add-6aab-390c-bb82-53939fb9cd0a', 'Love Deluxe', 'Sade', 1992, '#a18a72', 4, ''],
  ['f6b1b900-6108-32f0-abbd-2855af9151eb', 'Remain in Light', 'Talking Heads', 1980, '#be566b', 5, ''],
  ['ab1c1fd8-f769-4d78-90bc-4677f8ad8c22', 'Gemini Rights', 'Steve Lacy', 2022, '#a17291', 3, 'Bad Habit was my whole summer.'],
]

const DAY = 86_400_000
const BASE = Date.UTC(2026, 10, 3, 10) // 新しい順に、数日おきに追加した体で日付を散らす

export function seedDemoShelf(param: string | null) {
  const n = param === null || param === '' ? DEMO.length : Math.max(0, Math.min(DEMO.length, Number(param) || 0))
  const albums: Album[] = DEMO.slice(0, n).map(([mbid, title, artist, year, color, rating, note], i) => {
    const at = BASE - i * 5 * DAY - (i % 3) * DAY
    return {
      id: `demo-${String(i + 1).padStart(2, '0')}`,
      title,
      artist,
      coverUrl: `https://coverartarchive.org/release-group/${mbid}/front-500`,
      coverColor: color,
      rating,
      genre: null,
      note,
      year,
      source: 'musicbrainz',
      sourceId: mbid,
      createdAt: at,
      updatedAt: at,
    }
  })
  useStore.setState({ albums })
}
