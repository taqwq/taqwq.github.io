// 棚タイルと詳細ヒーローで同じ view-transition-name を使うための共有ヘルパー。
// UUID のハイフンは一部ブラウザで ident として嫌われるので除く。
export function coverVtName(id: string): string {
  return `cover-${id.replace(/-/g, '')}`
}
