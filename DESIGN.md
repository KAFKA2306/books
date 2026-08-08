# DESIGN

## 方針

- Quiet UI: 内容よりUIを目立たせない
- Editorial Paper: 暖色の紙面と高い可読性
- Hierarchy First: 影ではなく余白・文字組み・罫線で階層化
- Mobile First: 320px以上で操作可能
- No fake covers: 外部書影を推測せず、カテゴリ由来のタイポグラフィ表紙を使う
- Canonical API First: ブラウザUIは `api/v1/catalog.json` を正準データ源とし、旧圧縮catalogを直接読まない

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
3. Workカード
4. Work詳細
5. Edition
6. Holding
7. Acquisition
8. Import precheck

カードはWork単位です。巻・版・上下・雑誌号はカードを増やさず、`item_count` に統合します。EditionはISBN/ASIN等の版識別子、Holdingは実所蔵、AcquisitionはPurchase/Sample/Prime等の取得履歴として詳細画面で分離して表示します。

## 大規模本棚の操作原則

- 作品数が増えても検索・著者・カテゴリ・登録元で即座に絞り込める
- 適用中フィルターはチップとして表示し、1操作で解除できる
- モバイルでは本棚を先に見せ、フィルターは必要時だけ展開する
- 結果ツールバーはスクロール中も残し、表示切替・CSV・絞り込みへ戻りやすくする
- ページ送りには前後移動と省略表示を持たせる
- Work詳細からEdition / Holding / Acquisitionの関係を追える
