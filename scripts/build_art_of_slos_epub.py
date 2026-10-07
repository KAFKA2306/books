#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import re
import urllib.request
import uuid
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

DOC_ID = "1WWQ9asDFlgr7f4jTh2xgxm8XIMLK_244-sDBMIvqVtw"
SOURCE_URL = f"https://docs.google.com/document/d/{DOC_ID}/export?format=txt"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist" / "the-art-of-slos-ja.epub"
COVER_PATH = ROOT / "ebooks" / "the-art-of-slos-ja" / "cover.jpg"

TITLE = "The Art of SLOs 日本語版"
CREATOR = "Google Customer Reliability Engineering"
LANG = "ja"
LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"
ORIGINAL_URL = "https://sre.google/intl/ja_jp/resources/practices-and-processes/art-of-slos/"
TRAILING_LAYOUT_URL = "https://cre.page.link/art-of-slos-handbook"
BOOK_ID = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_URL, ORIGINAL_URL + '#ja-epub')}"

MAJOR_HEADINGS = {
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

SUBHEADINGS = {
    "ビジネス側の考え方",
    "開発側の考え方",
    "運用側の考え方",
    "この形式で SLI を表現することの意義",
    "ユーザー ジャーニーを SLI の仕様に変換",
    "リクエスト/レスポンス",
    "その他の可用性の SLI",
    "その他のレイテンシーの SLI",
    "データ処理",
    "データの鮮度をレスポンスの品質として測定",
    "SLO ワークシートの例",
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
}

METHOD_HEADINGS = {
    "ログの処理",
    "アプリケーション サーバーの指標",
    "フロントエンド インフラストラクチャの指標",
    "合成クライアント (外部監視) 又はデータ",
    "クライアントへの埋め込み",
}

SLI_DEFINITIONS = {
    "有効なイベントのなかで良いものの割合",
    "有効なリクエストのうち成功した割合",
    "しきい値よりも速く実行された有効なリクエストの割合",
    "品質を劣化させることなく処理された有効なリクエストの割合",
    "しきい値よりも新しく更新された有効なデータの割合",
    "処理に成功した有効なデータの割合",
    "正確な出力を生成する有効なデータの割合",
    "データ処理レートがしきい値よりも速い時間の割合",
}

SEPARATOR_RE = re.compile(r"^_{6,}$")
PAGE_NUMBER_RE = re.compile(r"^\d{1,3}$")
BULLET_RE = re.compile(r"^[*•]\s*(.+)$")
ORDERED_RE = re.compile(r"^(\d+)\.\s+(.+)$")
URL_RE = re.compile(r"https?://[^\s<]+")
TERMINAL_RE = re.compile(r"[。！？!?）】」』]$")


@dataclass(frozen=True)
class SourceLine:
    text: str
    tabbed: bool = False
    blank: bool = False


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


def normalize_source(text: str) -> list[SourceLine]:
    text = text.replace("\r\n", "\n").replace("\r", "\n").lstrip("\ufeff")
    source: list[SourceLine] = []
    for raw in text.split("\n"):
        raw = raw.replace("\u00a0", " ").replace("\u3000", " ").rstrip()
        tabbed = bool(re.match(r"^\s*\t", raw))
        value = re.sub(r"[\t ]+", " ", raw).strip()
        source.append(SourceLine(value, tabbed=tabbed, blank=not value))

    # The exported document starts with a title, source URL, and a page-numbered
    # table of contents. The first exact body heading is the real content start.
    try:
        body_start = next(i for i, line in enumerate(source) if line.text == "ダウンタイム早見表")
    except StopIteration as exc:
        raise RuntimeError("Could not locate the start of the handbook body") from exc
    source = source[body_start:]

    cleaned: list[SourceLine] = []
    previous_blank = True
    previous_text = ""
    for line in source:
        value = line.text
        if not value:
            if not previous_blank:
                cleaned.append(SourceLine("", blank=True))
            previous_blank = True
            continue
        if SEPARATOR_RE.fullmatch(value) or PAGE_NUMBER_RE.fullmatch(value):
            continue
        if value == TRAILING_LAYOUT_URL:
            continue
        if len(value) == 1 and value in {"|", "·", "●", "○", "□", "■", "◆", "◇"}:
            continue
        if value == previous_text and (value in MAJOR_HEADINGS or value in SUBHEADINGS):
            continue
        cleaned.append(SourceLine(value, tabbed=line.tabbed))
        previous_blank = False
        previous_text = value
    while cleaned and cleaned[-1].blank:
        cleaned.pop()
    return cleaned


def inline_html(text: str) -> str:
    parts: list[str] = []
    cursor = 0
    for match in URL_RE.finditer(text):
        parts.append(html.escape(text[cursor:match.start()]))
        url = match.group(0).rstrip("。、）)]}")
        suffix = match.group(0)[len(url):]
        escaped = html.escape(url, quote=True)
        parts.append(f'<a href="{escaped}">{escaped}</a>{html.escape(suffix)}')
        cursor = match.end()
    parts.append(html.escape(text[cursor:]))
    return "".join(parts)


def slug_anchor(counter: int) -> str:
    return f"sec-{counter}"


def is_structural(text: str) -> bool:
    if not text:
        return True
    return (
        text in MAJOR_HEADINGS
        or text in SUBHEADINGS
        or text in METHOD_HEADINGS
        or text in SLI_DEFINITIONS
        or text in {"メリット", "デメリット", "SLO がどのように...", "...良い信頼性のためにビジネスを設計するのに役立つか"}
        or BULLET_RE.match(text) is not None
        or ORDERED_RE.match(text) is not None
        or URL_RE.fullmatch(text) is not None
    )


def consume_plain_paragraph(lines: list[SourceLine], start: int) -> tuple[str, int]:
    pieces = [lines[start].text]
    i = start + 1
    while i < len(lines):
        current = lines[i]
        if current.blank or is_structural(current.text):
            break
        prior = pieces[-1]
        # Join short PDF/slide line wraps, but keep full document paragraphs separate.
        if len(prior) <= 64 and not TERMINAL_RE.search(prior):
            pieces[-1] = f"{prior} {current.text}"
            i += 1
            continue
        break
    return " ".join(pieces), i


def render_downtime_tables(lines: list[SourceLine], start: int) -> tuple[str, int]:
    values: list[str] = []
    i = start + 1
    while i < len(lines) and not lines[i].text.startswith("赤で網掛けされた"):
        if lines[i].text:
            values.append(lines[i].text)
        i += 1
    if len(values) < 37:
        raise RuntimeError("Downtime lookup table did not match the expected source structure")
    note = lines[i].text if i < len(lines) else ""
    i += 1

    # Export order: two-level header followed by 8 rows x 4 cells.
    period_headers = values[2:5]
    data = values[5:]
    if len(data) % 4:
        raise RuntimeError("Downtime lookup table has an unexpected cell count")
    rows = [data[n:n + 4] for n in range(0, len(data), 4)]
    table_rows = "".join(
        "<tr>" + "".join(f"<td>{inline_html(cell)}</td>" for cell in row) + "</tr>"
        for row in rows
    )
    first_table = f"""
<table class="data-table downtime-table">
<caption>信頼性レベルごとの許容ダウンタイム</caption>
<thead>
<tr><th rowspan="2">{inline_html(values[0])}</th><th colspan="3">{inline_html(values[1])}</th></tr>
<tr>{''.join(f'<th>{inline_html(cell)}</th>' for cell in period_headers)}</tr>
</thead>
<tbody>{table_rows}</tbody>
</table>
<p class="table-note">{inline_html(note)}</p>"""

    while i < len(lines) and lines[i].blank:
        i += 1
    title_parts: list[str] = []
    for _ in range(2):
        if i < len(lines) and lines[i].text:
            title_parts.append(lines[i].text)
            i += 1
    cells: list[str] = []
    while i < len(lines) and len(cells) < 8:
        if lines[i].text:
            cells.append(lines[i].text)
        i += 1
    if len(cells) != 8:
        raise RuntimeError("Error-rate downtime table did not match the expected source structure")
    second_table = f"""
<h3>{inline_html(' '.join(title_parts))}</h3>
<table class="data-table compact-table">
<thead><tr><th>エラー率</th>{''.join(f'<th>{inline_html(x)}</th>' for x in cells[:4])}</tr></thead>
<tbody><tr><th>許容ダウンタイム</th>{''.join(f'<td>{inline_html(x)}</td>' for x in cells[4:])}</tr></tbody>
</table>"""
    return first_table + second_table, i


def render_method_table(lines: list[SourceLine], start: int) -> tuple[str, int]:
    title = lines[start].text
    i = start + 1
    description_parts: list[str] = []
    while i < len(lines) and lines[i].text not in {"メリット", "デメリット"}:
        if lines[i].text:
            description_parts.append(lines[i].text)
        i += 1
    while i < len(lines) and lines[i].text in {"メリット", "デメリット"}:
        i += 1

    bullets: list[tuple[str, bool]] = []
    while i < len(lines):
        text = lines[i].text
        match = BULLET_RE.match(text)
        if not match:
            break
        bullets.append((match.group(1), lines[i].tabbed))
        i += 1

    tabbed_positions = [n for n, (_, tabbed) in enumerate(bullets) if tabbed]
    split = tabbed_positions[1] if len(tabbed_positions) >= 2 else max(1, len(bullets) // 2)
    benefits = [text for text, _ in bullets[:split]]
    drawbacks = [text for text, _ in bullets[split:]]

    def list_html(items: list[str]) -> str:
        return "<ul>" + "".join(f"<li>{inline_html(x)}</li>" for x in items) + "</ul>"

    description = " ".join(description_parts)
    table = f"""
<h3>{inline_html(title)}</h3>
<p>{inline_html(description)}</p>
<table class="data-table pros-cons">
<thead><tr><th>メリット</th><th>デメリット</th></tr></thead>
<tbody><tr><td>{list_html(benefits)}</td><td>{list_html(drawbacks)}</td></tr></tbody>
</table>"""
    return table, i


def render_body(lines: list[SourceLine]) -> tuple[str, list[tuple[str, str]]]:
    out: list[str] = []
    toc: list[tuple[str, str]] = []
    section = 0
    i = 0

    def add_heading(label: str, level: int = 2, toc_entry: bool = True) -> None:
        nonlocal section
        if toc_entry:
            section += 1
            anchor = slug_anchor(section)
            toc.append((label, anchor))
            out.append(f'<h{level} id="{anchor}">{html.escape(label)}</h{level}>')
        else:
            out.append(f'<h{level}>{html.escape(label)}</h{level}>')

    while i < len(lines):
        line = lines[i]
        text = line.text
        if line.blank:
            i += 1
            continue

        if text == "ダウンタイム早見表":
            add_heading(text)
            table_html, i = render_downtime_tables(lines, i)
            out.append(table_html)
            continue

        if text == "SLO がどのように...":
            add_heading("SLO を利用して")
            second = ""
            if i + 1 < len(lines) and lines[i + 1].text.startswith("...良い信頼性"):
                second = lines[i + 1].text
                i += 1
            out.append(f'<p class="section-kicker">{inline_html((text + second).replace("......", "..."))}</p>')
            i += 1
            continue

        if text in MAJOR_HEADINGS:
            add_heading(text)
            i += 1
            continue

        if text in METHOD_HEADINGS:
            rendered, i = render_method_table(lines, i)
            out.append(rendered)
            continue

        if text in SUBHEADINGS:
            add_heading(text, level=3, toc_entry=False)
            i += 1
            continue

        if text == "有効なイベントのなかで良いものの割合":
            out.append(
                '<div class="formula" role="doc-example">'
                '<div class="formula-expression"><span>良いイベント数</span><span class="operator">÷</span><span>有効なイベント数</span></div>'
                f'<p>{inline_html(text)}</p></div>'
            )
            i += 1
            continue

        if text in SLI_DEFINITIONS:
            out.append(f'<div class="definition"><strong>SLI 定義</strong><p>{inline_html(text)}</p></div>')
            i += 1
            continue

        if text == "1. SLI は 0% と 100% の間におさまる" and i + 3 < len(lines):
            first_title = text[3:]
            first_body = lines[i + 1].text
            second_match = ORDERED_RE.match(lines[i + 2].text)
            if second_match and second_match.group(1) == "2":
                second_title = second_match.group(2)
                second_body = lines[i + 3].text
                out.append(
                    '<ol class="principles">'
                    f'<li><strong>{inline_html(first_title)}</strong><p>{inline_html(first_body)}</p></li>'
                    f'<li><strong>{inline_html(second_title)}</strong><p>{inline_html(second_body)}</p></li>'
                    '</ol>'
                )
                i += 4
                continue

        ordered = ORDERED_RE.match(text)
        if ordered:
            items: list[str] = []
            while i < len(lines):
                match = ORDERED_RE.match(lines[i].text)
                if not match:
                    break
                items.append(match.group(2))
                i += 1
            out.append("<ol>" + "".join(f"<li>{inline_html(x)}</li>" for x in items) + "</ol>")
            continue

        bullet = BULLET_RE.match(text)
        if bullet:
            items: list[str] = []
            while i < len(lines):
                match = BULLET_RE.match(lines[i].text)
                if not match:
                    break
                items.append(match.group(1))
                i += 1
            out.append("<ul>" + "".join(f"<li>{inline_html(x)}</li>" for x in items) + "</ul>")
            continue

        if URL_RE.fullmatch(text):
            out.append(f'<p class="resource-link">{inline_html(text)}</p>')
            i += 1
            continue

        paragraph, i = consume_plain_paragraph(lines, i)
        out.append(f"<p>{inline_html(paragraph)}</p>")

    return "\n".join(out), toc


def xhtml_page(title: str, body: str, body_class: str = "") -> str:
    class_attr = f' class="{body_class}"' if body_class else ""
    return f"""<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja" lang="ja">
<head><title>{html.escape(title)}</title><meta name="viewport" content="width=device-width"/><link rel="stylesheet" href="styles.css" type="text/css"/></head>
<body{class_attr}>{body}</body>
</html>"""


def build() -> None:
    if not COVER_PATH.exists():
        raise FileNotFoundError(f"Cover image not found: {COVER_PATH}")

    content, toc = render_body(normalize_source(fetch_text()))
    modified = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    cover = xhtml_page(
        TITLE,
        f'<section epub:type="cover" class="cover"><img src="cover.jpg" alt="{html.escape(TITLE)}"/></section>',
        "cover-page",
    )

    license_page = xhtml_page("ライセンスと帰属", f"""
<section epub:type="copyright-page">
<h1>ライセンスと帰属</h1>
<p>原資料は Google が公開する「The Art of SLOs」日本語版です。</p>
<p>ライセンス: <a href="{LICENSE_URL}">Creative Commons Attribution 4.0 International (CC BY 4.0)</a></p>
<p>原典: <a href="{ORIGINAL_URL}">{ORIGINAL_URL}</a></p>
<p>変更内容: 公開日本語資料をリフロー型EPUBへ再構成し、不要なページレイアウト情報を除去し、目次・見出し・段落・箇条書き・定義・表・電子書籍用メタデータを追加しました。</p>
<p>本EPUBはGoogle公式配布物ではありません。</p>
</section>
""")

    nav_items = "".join(
        f'<li><a href="content.xhtml#{anchor}">{html.escape(label)}</a></li>'
        for label, anchor in toc
    )
    nav = f"""<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja" lang="ja">
<head><title>目次</title><link rel="stylesheet" href="styles.css" type="text/css"/></head>
<body><nav epub:type="toc" id="toc"><h1>目次</h1><ol>
<li><a href="cover.xhtml">表紙</a></li>
<li><a href="license.xhtml">ライセンスと帰属</a></li>
{nav_items}
</ol></nav></body></html>"""

    css = """
html,body{writing-mode:horizontal-tb;}body{font-family:serif;line-height:1.75;margin:5%;overflow-wrap:anywhere;}h1,h2,h3{line-height:1.35;break-after:avoid;}h1{font-size:1.8em;}h2{font-size:1.45em;margin-top:2.2em;border-bottom:1px solid #8aa4bf;padding-bottom:.28em;}h3{font-size:1.15em;margin-top:1.7em;}p{margin:.72em 0;}ul,ol{margin:.7em 0 1em 1.4em;padding:0;}li{margin:.35em 0;}.cover-page{margin:0;padding:0;text-align:center;}.cover{margin:0;padding:0;}.cover img{display:block;width:100%;height:auto;margin:0 auto;}.section-kicker{font-weight:bold;font-size:1.08em;}.formula,.definition{border:1px solid #8aa4bf;border-radius:.35em;padding:.8em 1em;margin:1em 0;background:#f4f8fc;}.formula-expression{display:flex;gap:.65em;align-items:center;justify-content:center;font-weight:bold;font-size:1.08em;}.operator{font-size:1.25em;}.definition strong{font-size:.9em;}.definition p{margin:.35em 0 0;}.data-table{border-collapse:collapse;width:100%;margin:1em 0;font-size:.88em;table-layout:fixed;}.data-table caption{font-weight:bold;text-align:left;margin-bottom:.45em;}.data-table th,.data-table td{border:1px solid #8a8a8a;padding:.45em;vertical-align:top;}.data-table th{font-weight:bold;background:#eef3f7;}.data-table ul{margin:.2em 0 .2em 1.1em;}.table-note{font-size:.86em;}.resource-link a{word-break:break-all;}a{color:inherit;}@media(max-width:480px){body{margin:4%;}.data-table{font-size:.78em;}.data-table th,.data-table td{padding:.3em;}}
""".strip()

    opf = f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="ja" prefix="rendition: http://www.idpf.org/vocab/rendition/#">
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
<item id="cover-image" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>
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
            "EPUB/content.xhtml": xhtml_page(TITLE, content),
            "EPUB/nav.xhtml": nav,
        }.items():
            archive.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)
        archive.write(COVER_PATH, "EPUB/cover.jpg", compress_type=zipfile.ZIP_DEFLATED)
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


def self_test() -> None:
    sample = """The Art\nof SLOs\n\n原文: https://example.invalid\n________________\nダウンタイム早見表        3\nSLI の方程式        5\n________________\nダウンタイム早見表\n信頼性レベル\n\t許容される 100% のダウンタイム\n\t1年あたり\n\t四半期あたり\n\t28 日あたり\n\t90%\n\t36日 12時間\n\t9日\n\t2日 19時間 12分\n\t95%\n\t18日 6時間\n\t4日 12時間\n\t1日 9時間 36分\n\t99%\n\t3日 15時間 36分\n\t21時間 36分\n\t6時間 43分 12秒\n\t99.5%\n\t1日 19時間 48分\n\t10時間 48分\n\t3時間 21分 36秒\n\t99.9%\n\t8時間 45分 36秒\n\t2時間 9分 36秒\n\t40分 19秒\n\t99.95%\n\t4時間 22分 48秒\n\t1時間 4分 48秒\n\t20分 10秒\n\t99.99%\n\t52分 33.6秒\n\t12分 57.6秒\n\t4分 1.9秒\n\t99.999%\n\t5分 15.4秒\n\t1分 17.8秒\n\t24.2秒\n\t赤で網掛けされた枠内は許容される完全なダウンタイムは１時間未満のもの\n\n28日間で99.95％の信頼性に対して、エラー率を考慮した場合に\n許容されるダウンタイム\n\t100%\n\t10%\n\t1%\n\t0.1%\n\t20分 10秒\n\t3時間 21分 36秒\n\t1日 9時間 36分\n\t14日\nSLO がどのように...\n...良い信頼性のためにビジネスを設計するのに役立つか\n________________\nSLI の方程式\n有効なイベントのなかで良いものの割合\nこの形式で SLI を表現することの意義\n1. SLI は 0% と 100% の間におさまる\n説明です。\n2. 一貫したフォーマットの SLI\n説明です。\nSLI の測定\nログの処理\n説明です。\nメリット\n\tデメリット\n\t * 利点A\n * 利点B\n\t * 欠点A\n * 欠点B\nStoker Labs Inc.\n本文です。\n"""
    body, toc = render_body(normalize_source(sample))
    assert "<table" in body and "99.999%" in body
    assert '<div class="formula"' in body
    assert "<ol class=\"principles\">" in body
    assert "pros-cons" in body and "利点A" in body and "欠点A" in body
    assert not SEPARATOR_RE.search(body)
    assert not re.search(r"ダウンタイム早見表\s+3", body)
    assert any(label == "SLO を利用して" for label, _ in toc)
    print("self-test: ok")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
    else:
        build()


if __name__ == "__main__":
    main()