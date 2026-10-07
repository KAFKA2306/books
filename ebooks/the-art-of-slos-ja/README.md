# The Art of SLOs 日本語版 - Kindle向けEPUB

Google Customer Reliability Engineering が公開している日本語版 **The Art of SLOs - Participant Handbook** を、Kindle等の電子書籍リーダーで読みやすいリフロー型EPUBへ再構成した非公式版です。

## ダウンロード

GitHub Releases の `the-art-of-slos-ja.epub` を Send to Kindle に送ってください。

## 表示方式

EPUB 3 の `rendition:layout=reflowable` と `rendition:flow=scrolled-continuous` を指定し、縦方向へ連続して読む構造にしています。

ただし、最終的なページ送り・縦スクロールの表示方式はKindleアプリ/端末側の対応と設定にも依存します。Kindle側に「縦スクロール」等の表示設定がある場合は、そちらも有効にしてください。

## このEPUBで整えたもの

- 原文URL、ページ番号付き目次、罫線、過剰な空行、タブ、ページレイアウト由来の単独記号、重複見出しを除去
- 章見出し、小見出し、本文、番号付き/箇条書き、SLI定義をHTML要素として再構成
- 「ダウンタイム早見表」をHTML tableとして復元
- 「SLI の測定」のメリット/デメリットを表として復元
- 青系の技術書表紙をJPEGで埋め込み、EPUB 3の`cover-image`とKindle互換用coverメタデータを付与

## 原典

- Google SRE: https://sre.google/intl/ja_jp/resources/practices-and-processes/art-of-slos/
- 日本語版 Google Docs: https://docs.google.com/document/d/1WWQ9asDFlgr7f4jTh2xgxm8XIMLK_244-sDBMIvqVtw/edit

## ライセンスと帰属

原資料は **Creative Commons Attribution 4.0 International (CC BY 4.0)** で公開されています。

- Original author: Google
- License: https://creativecommons.org/licenses/by/4.0/
- このEPUBでの変更: 公開日本語資料をリフロー型EPUBへ再構成し、不要なページレイアウト情報を除去し、目次、見出し、段落、箇条書き、定義、表、表紙、電子書籍用メタデータを追加。
- 本EPUBはGoogle公式配布物ではありません。

## 再生成

```bash
python scripts/build_art_of_slos_epub.py --self-test
python scripts/build_art_of_slos_epub.py
```

公式の公開Google Docを取得して `dist/the-art-of-slos-ja.epub` を再生成します。

## 対象外

「Software Engineering at Google」のデジタル版は **CC BY-NC-ND 4.0** のため、翻訳版を作って再配布する用途には使いません。