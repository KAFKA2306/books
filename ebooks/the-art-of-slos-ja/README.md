# The Art of SLOs 日本語版 - Kindle向けEPUB

Google Customer Reliability Engineering が公開している日本語版 **The Art of SLOs - Participant Handbook** を、Kindle等の電子書籍リーダーで読みやすいリフロー型EPUBへ再構成した非公式版です。

## ダウンロード

GitHub Releases の `the-art-of-slos-ja.epub` を Send to Kindle に送ってください。

## 原典

- Google SRE: https://sre.google/intl/ja_jp/resources/practices-and-processes/art-of-slos/
- 日本語版 Google Docs: https://docs.google.com/document/d/1WWQ9asDFlgr7f4jTh2xgxm8XIMLK_244-sDBMIvqVtw/edit

## ライセンスと帰属

原資料は **Creative Commons Attribution 4.0 International (CC BY 4.0)** で公開されています。

- Original author: Google
- License: https://creativecommons.org/licenses/by/4.0/
- このEPUBでの変更: 公開日本語資料をリフロー型EPUBへ再構成し、目次、見出し、段落、電子書籍用メタデータを追加。
- 本EPUBはGoogle公式配布物ではありません。

図表の一部はテキスト抽出上の制約により簡略化されています。正確な図表は公式PDF / Google Docsを参照してください。

## 再生成

```bash
python scripts/build_art_of_slos_epub.py
```

公式の公開Google Docを取得して `dist/the-art-of-slos-ja.epub` を再生成します。

## 対象外

「Software Engineering at Google」のデジタル版は **CC BY-NC-ND 4.0** のため、翻訳版を作って再配布する用途には使いません。
