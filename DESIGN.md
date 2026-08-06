# DESIGN

## 方針

- Quiet UI: 内容よりUIを目立たせない
- Editorial Paper: 暖色の紙面と高い可読性
- Hierarchy First: 影ではなく余白・文字組み・罫線で階層化
- Mobile First: 320px以上で操作可能
- No fake covers: 外部書影を推測せず、カテゴリ由来のタイポグラフィ表紙を使う

## 基本色

- Background: `#f5f4ef`
- Paper: `#fcfbf8`
- Surface: `#ffffff`
- Accent: `#0f766e`
- Ink: `#1a1c20`
- Muted: `#64748b`

## 情報設計

1. 全体集計
2. 検索・ファセット
3. 作品カード
4. Work詳細
5. Edition / Holding
6. Import precheck

カードはWork単位です。巻・版・上下・雑誌号はカードを増やさず、`item_count` に統合します。
