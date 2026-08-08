# UI / UX

KAFKA BOOKSのUIは、Workを最小の閲覧単位として、大量の所蔵を検索・絞り込み・詳細確認できることを優先します。

## データ源

ブラウザはPages配信時に生成される `api/v1/catalog.json` を直接読み込みます。`data/catalog.parts.json` やIssue由来の圧縮分割をブラウザ側で再構成しません。これにより、Kindle XML・ISBN enrichment・Issue取込などサーバー側の正準マージ結果とUI表示が一致します。

## 一覧

- Work単位でカード表示
- 書名・著者・カテゴリ・登録元・形式を横断検索
- 読書状態・カテゴリ・登録元ファセット
- グリッド / リスト表示
- URLへ検索条件を保持
- 適用中フィルターは解除可能なチップとして表示
- 48 Work / page
- 前後ボタン + 近傍ページ + 省略記号によるページ送り

## モバイル

820px以下ではフィルターを初期折り畳みにし、本棚を先に表示します。`絞り込み` ボタンで開閉し、適用フィルター数をボタンに表示します。`/` キー検索はフィルターを自動展開して検索欄へフォーカスします。

## Work詳細

詳細ダイアログは、Workの概要だけでなく次を分離表示します。

- Edition: ISBN / ASIN / format / verification
- Holding: source / format / acquired_at / quantity
- Acquisition: purchase / sample / prime等の履歴とowned判定

ISBNとASINを同じ識別子として扱わず、UI上でもEdition識別子として区別します。

## 表紙

外部書影を推測しません。カテゴリと書名を使ったタイポグラフィ表紙を継続し、データに存在しない画像を表示しません。
