#!/usr/bin/env python3
from __future__ import annotations

import html
import os
import re
import urllib.request
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

DOC_ID = "1WWQ9asDFlgr7f4jTh2xgxm8XIMLK_244-sDBMIvqVtw"
SOURCE_URL = f"https://docs.google.com/document/d/{DOC_ID}/export?format=txt"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist" / "the-art-of-slos-ja.epub"
DEFAULT_COVER = ROOT / "ebooks" / "the-art-of-slos-ja" / "cover.jpg"

TITLE = "The Art of SLOs 日本語版"
CREATOR = "Google Customer Reliability Engineering"
LANG = "ja"
LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"
ORIGINAL_URL = "https://sre.google/intl/ja_jp/resources/practices-and-processes/art-of-slos/"
BOOK_ID = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_URL, ORIGINAL_URL + '#ja-epub')}"

H2_HEADINGS = {
    "ダウンタイム早見表",
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

H3_HEADINGS = {
    "ユーザー ジャーニーを SLI の仕様に変換",
    "この形式で SLI を表現することの意義",
    "リクエスト/レスポンス",
    "その他の可用性の SLI",
    "その他のレイテンシーの SLI",
    "データ処理",
    "データの鮮度をレスポンスの品質として測定",
    "SLO ワークシートの例",
    "ログの処理",
    "アプリケーション サーバーの指標",
    "フロントエンド インフラストラクチャの指標",
    "合成クライアント (外部監視) 又はデータ",
    "クライアントへの埋め込み",
    "ミッションステートメント",
    "ゲーム: Fang Faction",
    "プロファイル ページを見る",
    "ゲーム内通貨の購入",
    "アプリの起動",
    "陣地の管理",
    "別のプレイヤーとの対戦",
    "リーダーボードの生成",
    "影響",
    "根本原因とトリガー",
    "検出",
    "学んだ教訓",
    "うまくいったこと",
    "うまくいかなかったこと",
    "幸運だったこと",
    "アクションアイテム",
    "メリット",
    "デメリット",
    "ビジネス側の考え方",
    "開発側の考え方",
    "運用側の考え方",
}


def fetch_text() -> str:
    local_source = os.environ.get("ART_OF_SLOS_SOURCE_FILE")
    if local_source:
        return Path(local_source).read_text(encoding="utf-8-sig")

    req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as response:
        raw = response.read()
    for encoding in ("utf-8-sig", "utf-8", "cp932"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            pass
    raise RuntimeError("Could not decode source document")


def normalize_line(line: str) -> str:
    value = line.replace("\u3000", " ").strip()
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\s+([、。！？：；）】》])", r"\1", value)
    value = re.sub(r"([（【《])\s+", r"\1", value)
    return value.strip()


def clean_lines(text: str) -> list[str]:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    raw = [normalize_line(line) for line in text.split("\n")]

    # Drop the PDF-style cover, source URL and page-number TOC.
    try:
        start = raw.index("ダウンタイム早見表")
        raw = raw[start:]
    except ValueError:
        pass

    lines: list[str] = []
    for value in raw:
        if not value:
            continue
        if re.fullmatch(r"[_＿—–-]{3,}", value):
            continue
        if value.startswith("原文:"):
            continue
        if re.fullmatch(r"\d{1,3}", value):
            continue
        if re.fullmatch(r".+\s{2,}\d{1,3}", value):
            continue
        if re.fullmatch(r"[•·⋯…|｜]+", value):
            continue
        lines.append(value)
    return lines


def make_table(headers: list[str], rows: list[list[str]], caption: str | None = None) -> str:
    caption_html = f"<caption>{html.escape(caption)}</caption>" if caption else ""
    head = "".join(f"<th scope=\"col\">{html.escape(cell)}</th>" for cell in headers)
    body = "".join(
        "<tr>" + "".join(f"<td>{html.escape(cell)}</td>" for cell in row) + "</tr>"
        for row in rows
    )
    return f'<div class="table-wrap"><table>{caption_html}<thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'


def parse_downtime_intro(lines: list[str]) -> tuple[str, int]:
    if not lines or lines[0] != "ダウンタイム早見表":
        return "", 0

    i = 1
    expected_headers = [
        "信頼性レベル",
        "許容される 100% のダウンタイム",
        "1年あたり",
        "四半期あたり",
        "28 日あたり",
    ]
    if lines[i:i + 5] != expected_headers:
        return "", 0
    i += 5

    rows = []
    for _ in range(8):
        if i + 4 > len(lines):
            return "", 0
        rows.append(lines[i:i + 4])
        i += 4

    note = lines[i] if i < len(lines) else ""
    i += 1 if note else 0

    first = make_table(
        ["信頼性レベル", "1年あたり", "四半期あたり", "28日あたり"],
        rows,
        "許容される 100% のダウンタイム",
    )
    note_html = f'<p class="note">{html.escape(note)}</p>' if note else ""

    second = ""
    if i + 10 <= len(lines) and lines[i].startswith("28日間で99.95") and lines[i + 1] == "許容されるダウンタイム":
        caption = lines[i] + "、" + lines[i + 1]
        rates = lines[i + 2:i + 6]
        values = lines[i + 6:i + 10]
        if len(rates) == 4 and len(values) == 4:
            second = make_table(
                ["エラー率", *rates],
                [["許容されるダウンタイム", *values]],
                caption,
            )
            i += 10

    html_out = '<h2 id="sec-downtime">ダウンタイム早見表</h2>' + first + note_html + second
    return html_out, i


def build_body(lines: list[str]) -> tuple[str, list[tuple[str, str]]]:
    parts: list[str] = []
    toc: list[tuple[str, str]] = []

    intro_html, i = parse_downtime_intro(lines)
    if intro_html:
        parts.append(intro_html)
        toc.append(("ダウンタイム早見表", "sec-downtime"))
    else:
        i = 0

    section = 1
    in_ul = False
    in_ol = False

    def close_lists() -> None:
        nonlocal in_ul, in_ol
        if in_ul:
            parts.append("</ul>")
            in_ul = False
        if in_ol:
            parts.append("</ol>")
            in_ol = False

    while i < len(lines):
        value = lines[i]
        i += 1

        if value == "SLO がどのように..." and i < len(lines) and lines[i].startswith("...良い信頼性"):
            close_lists()
            section += 1
            anchor = f"sec-{section}"
            toc.append(("SLO を利用して", anchor))
            parts.append(f'<h2 id="{anchor}">SLO を利用して</h2>')
            value = "SLO がどのように良い信頼性のためにビジネスを設計するのに役立つか"
            i += 1

        if value in H2_HEADINGS:
            close_lists()
            section += 1
            anchor = f"sec-{section}"
            toc.append((value, anchor))
            parts.append(f'<h2 id="{anchor}">{html.escape(value)}</h2>')
            continue

        if value in H3_HEADINGS:
            close_lists()
            parts.append(f"<h3>{html.escape(value)}</h3>")
            continue

        if value == "有効なイベントのなかで良いものの割合":
            close_lists()
            parts.append('<p class="equation"><strong>SLI</strong> = 有効なイベントのなかで良いものの割合</p>')
            continue

        bullet = re.match(r"^[*・]\s*(.+)$", value)
        if bullet:
            if in_ol:
                parts.append("</ol>")
                in_ol = False
            if not in_ul:
                parts.append("<ul>")
                in_ul = True
            parts.append(f"<li>{html.escape(bullet.group(1))}</li>")
            continue

        numbered = re.match(r"^(\d+)\.\s*(.+)$", value)
        if numbered:
            if in_ul:
                parts.append("</ul>")
                in_ul = False
            if not in_ol:
                number = int(numbered.group(1))
                start_attr = f' start="{number}"' if number != 1 else ""
                parts.append(f"<ol{start_attr}>")
                in_ol = True
            parts.append(f"<li>{html.escape(numbered.group(2))}</li>")
            continue

        close_lists()

        if re.fullmatch(r"https?://\S+", value):
            url = html.escape(value, quote=True)
            parts.append(f'<p><a href="{url}">{html.escape(value)}</a></p>')
        elif value == "SLO:":
            parts.append("<h3>SLO</h3>")
        else:
            parts.append(f"<p>{html.escape(value)}</p>")

    close_lists()
    return "\n".join(parts), toc


def page(title: str, body: str, *, epub_ns: bool = False) -> str:
    ns = ' xmlns:epub="http://www.idpf.org/2007/ops"' if epub_ns else ""
    return f'''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"{ns} xml:lang="ja" lang="ja">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>{html.escape(title)}</title><link rel="stylesheet" href="styles.css" type="text/css"/></head>
<body>{body}</body>
</html>'''


def cover_bytes() -> bytes:
    path = Path(os.environ.get("ART_OF_SLOS_COVER", str(DEFAULT_COVER)))
    if not path.exists():
        raise FileNotFoundError(f"Cover image not found: {path}")
    return path.read_bytes()


def build() -> None:
    content, toc = build_body(clean_lines(fetch_text()))
    modified = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    cover = page(
        TITLE,
        '<section class="cover"><img src="cover.jpg" alt="The Art of SLOs 日本語版 表紙"/></section>',
    )

    license_page = page("ライセンスと帰属", f"""
<h1>ライセンスと帰属</h1>
<p>原資料は Google が公開する「The Art of SLOs」日本語版です。</p>
<p>ライセンス: <a href="{LICENSE_URL}">Creative Commons Attribution 4.0 International (CC BY 4.0)</a></p>
<p>原典: <a href="{ORIGINAL_URL}">{ORIGINAL_URL}</a></p>
<p>変更内容: 公開日本語資料をリフロー型EPUBへ再構成し、PDF由来の区切り線・ページ番号・重複目次等を除去、表を再構築し、目次・見出し・電子書籍用メタデータと表紙画像を追加しました。</p>
<p>本EPUBはGoogle公式配布物ではありません。</p>
<p>図表の一部はテキスト抽出上の制約により簡略化されています。正確な図表は公式資料を参照してください。</p>
""")

    nav_items = "".join(
        f'<li><a href="content.xhtml#{anchor}">{html.escape(label)}</a></li>'
        for label, anchor in toc
    )
    nav = page(
        "目次",
        f'<nav epub:type="toc" id="toc"><h1>目次</h1><ol><li><a href="license.xhtml">ライセンスと帰属</a></li>{nav_items}</ol></nav>',
        epub_ns=True,
    )

    css = """
html,body{margin:0;padding:0;writing-mode:horizontal-tb;overflow-x:hidden;overflow-y:auto;}
body{font-family:serif;line-height:1.8;padding:5%;word-wrap:break-word;}
h1,h2,h3{line-height:1.35;break-after:avoid;page-break-after:avoid;}
h2{margin-top:2em;border-bottom:1px solid #aaa;padding-bottom:.25em;}
h3{margin-top:1.4em;}
p{margin:.75em 0;orphans:2;widows:2;}
ul,ol{padding-left:1.5em;}
li{margin:.35em 0;}
a{word-break:break-all;}
.cover{margin:0;padding:0;text-align:center;}
.cover img{display:block;width:100%;height:auto;max-width:100%;margin:0 auto;}
.note{font-size:.9em;}
.equation{font-size:1.15em;text-align:center;padding:1em;border:1px solid #bbb;border-radius:.35em;}
.table-wrap{width:100%;overflow-x:auto;margin:1em 0;}
table{width:100%;border-collapse:collapse;font-size:.9em;}
caption{font-weight:bold;text-align:left;margin-bottom:.5em;}
th,td{border:1px solid #999;padding:.45em;vertical-align:top;}
th{font-weight:bold;}
""".strip()

    opf = f'''<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="ja">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">{BOOK_ID}</dc:identifier>
<dc:title>{TITLE}</dc:title>
<dc:language>{LANG}</dc:language>
<dc:creator>{CREATOR}</dc:creator>
<dc:rights>CC BY 4.0 / Original author Google</dc:rights>
<meta property="dcterms:modified">{modified}</meta>
<meta property="rendition:layout">reflowable</meta>
<meta property="rendition:flow">scrolled-continuous</meta>
<meta name="cover" content="cover-image"/>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="css" href="styles.css" media-type="text/css"/>
<item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>
<item id="cover-image" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>
<item id="license" href="license.xhtml" media-type="application/xhtml+xml"/>
<item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>
</manifest>
<spine page-progression-direction="ltr"><itemref idref="cover-page"/><itemref idref="license"/><itemref idref="content"/></spine>
</package>'''

    container_xml = '''<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="EPUB/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>'''

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
        archive.writestr("EPUB/cover.jpg", cover_bytes(), compress_type=zipfile.ZIP_DEFLATED)
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    build()
