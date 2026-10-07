#!/usr/bin/env python3
from __future__ import annotations

import html
import re
import urllib.request
import uuid
import zipfile
from pathlib import Path

DOC_ID = "1WWQ9asDFlgr7f4jTh2xgxm8XIMLK_244-sDBMIvqVtw"
SOURCE_URL = f"https://docs.google.com/document/d/{DOC_ID}/export?format=txt"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist" / "the-art-of-slos-ja.epub"

TITLE = "The Art of SLOs 日本語版"
CREATOR = "Google Customer Reliability Engineering"
LANG = "ja"
LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"
ORIGINAL_URL = "https://sre.google/intl/ja_jp/resources/practices-and-processes/art-of-slos/"

HEADINGS = {
    "ダウンタイム早見表",
    "SLO を利用して",
    "SLI の方程式",
    "可用性の SLI の特定",
    "レイテンシーの SLI の特定",
    "品質の SLI の特定",
    "鮮度の SLI の特定",
    "カバレージの SLI の特定",
    "正確性の SLI の特定",
    "スループットの SLI の特定",
    "SLO と SLI の作成",
    "SLI の測定",
    "Stoker Labs Inc.",
    "サービスのアーキテクチャ",
    "ユーザー ジャーニー",
    "ポストモーテム: 空のプロファイル ページ",
    "プロファイル ページのエラーとレイテンシー",
    "リソース",
}

def fetch_text() -> str:
    req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as response:
        raw = response.read()
    for encoding in ("utf-8-sig", "utf-8", "cp932"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            pass
    raise RuntimeError("Could not decode source document")

def clean_lines(text: str) -> list[str]:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = []
    for line in text.split("\n"):
        value = re.sub(r"[ \t]+", " ", line).strip()
        if not value or set(value) <= {"_"}:
            continue
        lines.append(value)
    return lines

def build_body(lines: list[str]) -> tuple[str, list[tuple[str, str]]]:
    paragraphs = []
    toc = []
    section = 0
    for line in lines:
        value = re.sub(r"\s+", " ", line)
        if value in HEADINGS:
            section += 1
            anchor = f"sec-{section}"
            toc.append((value, anchor))
            paragraphs.append(f'<h2 id="{anchor}">{html.escape(value)}</h2>')
        elif re.fullmatch(r"https?://\S+", value):
            url = html.escape(value, quote=True)
            paragraphs.append(f'<p><a href="{url}">{url}</a></p>')
        else:
            paragraphs.append(f"<p>{html.escape(value)}</p>")
    return "\n".join(paragraphs), toc

def page(title: str, body: str) -> str:
    return f"""<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ja" lang="ja">
<head><title>{html.escape(title)}</title><link rel="stylesheet" href="styles.css" type="text/css"/></head>
<body>{body}</body>
</html>"""

def build() -> None:
    content, toc = build_body(clean_lines(fetch_text()))
    book_id = f"urn:uuid:{uuid.uuid4()}"

    cover = page(TITLE, f"""
<section class="cover">
<h1>{TITLE}</h1>
<p>{CREATOR}</p>
<p>Kindle向け非公式リフロー版</p>
<p class="small">原資料: Google / CC BY 4.0</p>
</section>
""")

    license_page = page("ライセンスと帰属", f"""
<h1>ライセンスと帰属</h1>
<p>原資料は Google が公開する「The Art of SLOs」日本語版です。</p>
<p>ライセンス: <a href="{LICENSE_URL}">Creative Commons Attribution 4.0 International (CC BY 4.0)</a></p>
<p>原典: <a href="{ORIGINAL_URL}">{ORIGINAL_URL}</a></p>
<p>変更内容: 公開日本語資料をリフロー型EPUBへ再構成し、目次・見出し・段落・電子書籍用メタデータを追加しました。</p>
<p>本EPUBはGoogle公式配布物ではありません。</p>
<p>図表の一部はテキスト抽出上の制約により簡略化されています。正確な図表は公式資料を参照してください。</p>
""")

    nav_items = "".join(
        f'<li><a href="content.xhtml#{anchor}">{html.escape(label)}</a></li>'
        for label, anchor in toc
    )
    nav = f"""<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja">
<head><title>目次</title><link rel="stylesheet" href="styles.css" type="text/css"/></head>
<body><nav epub:type="toc" id="toc"><h1>目次</h1><ol>
<li><a href="cover.xhtml">表紙</a></li>
<li><a href="license.xhtml">ライセンスと帰属</a></li>
{nav_items}
</ol></nav></body></html>"""

    css = "body{font-family:serif;line-height:1.8;margin:5%;}h1,h2{line-height:1.35;}h2{margin-top:2em;border-bottom:1px solid #aaa;padding-bottom:.25em;}p{margin:.8em 0;}.cover{text-align:center;margin-top:20%;}.small{font-size:.85em;}a{word-break:break-all;}"

    opf = f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="ja">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">{book_id}</dc:identifier>
<dc:title>{TITLE}</dc:title>
<dc:language>{LANG}</dc:language>
<dc:creator>{CREATOR}</dc:creator>
<dc:rights>CC BY 4.0 / Original author Google</dc:rights>
<meta property="dcterms:modified">2026-10-07T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="css" href="styles.css" media-type="text/css"/>
<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
<item id="license" href="license.xhtml" media-type="application/xhtml+xml"/>
<item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>
</manifest>
<spine><itemref idref="cover"/><itemref idref="license"/><itemref idref="content"/></spine>
</package>"""

    container_xml = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="EPUB/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"""

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUT, "w") as archive:
        archive.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        for name, data in {
            "META-INF/container.xml": container_xml,
            "EPUB/content.opf": opf,
            "EPUB/styles.css": css,
            "EPUB/cover.xhtml": cover,
            "EPUB/license.xhtml": license_page,
            "EPUB/content.xhtml": page(TITLE, content),
            "EPUB/nav.xhtml": nav,
        }.items():
            archive.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")

if __name__ == "__main__":
    build()
