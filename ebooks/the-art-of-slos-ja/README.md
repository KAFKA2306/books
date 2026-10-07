# The Art of SLOs 日本語版 - Kindle向けEPUB

Google Customer Reliability Engineering が公開している日本語版 **The Art of SLOs - Participant Handbook** を、Kindle等の電子書籍リーダー向けに再構成した非公式EPUBです。

## ダウンロード

GitHub Releases の `the-art-of-slos-ja.epub` を Send to Kindle に送ってください。

## Kindle向け調整

- EPUB 3 / reflowable
- `rendition:flow = scrolled-continuous` を指定し、縦方向の連続スクロールを希望表示として設定
- 本文は横書きのまま、上下方向へ読む構成
- PDF由来の区切り線、元URL、ページ番号付き重複目次、大量の空白を除去
- ダウンタイム早見表とエラー率表をHTML tableとして再構築
- 見出し、箇条書き、SLI式を電子書籍向けに構造化
- 生成画像をEPUBの `cover-image` として埋め込み

Kindleアプリ・端末側が表示方式を上書きする場合、最終的な連続スクロール可否はKindle側の設定に依存します。

## 原典

- Google SRE: https://sre.google/intl/ja_jp/resources/practices-and-processes/art-of-slos/
- 日本語版 Google Docs: https://docs.google.com/document/d/1WWQ9asDFlgr7f4jTh2xgxm8XIMLK_244-sDBMIvqVtw/edit

## ライセンスと帰属

原資料は **Creative Commons Attribution 4.0 International (CC BY 4.0)** で公開されています。

- Original author: Google
- License: https://creativecommons.org/licenses/by/4.0/
- このEPUBでの変更: リフロー型EPUBへの再構成、レイアウト残骸の除去、表の再構築、目次・見出し・メタデータ・生成表紙の追加
- 本EPUBはGoogle公式配布物ではありません。

図表の一部はテキスト抽出上の制約により簡略化されています。正確な図表は公式PDF / Google Docsを参照してください。

## 再生成

```bash
python scripts/build_art_of_slos_epub.py
```

公式の公開Google Docを取得して `dist/the-art-of-slos-ja.epub` を再生成します。
