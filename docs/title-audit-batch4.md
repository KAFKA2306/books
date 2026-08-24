# Title audit batch 4

Issue #47 の第4バッチ。Work表示名に混入した巻号・販売形態・レーベルを、出版社公式書誌または国立国会図書館書誌に基づいて分離する。

- `インベスターZ(1)` → `インベスターＺ`
  - 講談社公式: https://www.kodansha.co.jp/comic/products/0000018461
  - 公式では作品名 `インベスターＺ`、巻は（１）として別扱い。
- `To LOVEる―とらぶる― モノクロ版【期間限定無料】 1 (ジャンプコミックスDIGITAL)` → `To LOVEる―とらぶる―`
  - 集英社公式: https://www.shueisha.co.jp/books/items/contents.html?isbn=978-4-08-874278-6
  - `モノクロ版` / `期間限定無料` / 巻号 / `ジャンプコミックスDIGITAL` は Work 本体の書名ではない。
- `ハンツー×トラッシュ(1) (ヤングマガジンコミックス)` → `ハンツー×トラッシュ`
  - 国立国会図書館: https://ndlsearch.ndl.go.jp/search?cs=bib&q-isbn=9784063822489
  - 書誌は `ハンツー×トラッシュ 1`、ISBN `978-4-06-382248-9`。正準Work名は `ハンツー×トラッシュ` とする。
- `目黒さんは初めてじゃない(1) (パルシィコミックス)` → `目黒さんは初めてじゃない`
  - 講談社公式: https://www.kodansha.co.jp/titles/1000031083
  - 作品ページで Work 名と各巻を分離している。
- `寄生獣(3) (アフタヌーンコミックス)` → `寄生獣`
  - 講談社公式: https://www.kodansha.co.jp/comic/products/0000029954
  - 公式書誌は `寄生獣（３）`、シリーズ `アフタヌーンＫＣ`。Work名は `寄生獣`。

このバッチは Work の表示名だけを正規化し、巻・版・販売形態を失ったことにはしない。元値は既存 provenance / raw data に保持し、`from_title` drift guard を維持する。
