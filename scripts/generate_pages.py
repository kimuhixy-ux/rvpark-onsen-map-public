#!/usr/bin/env python3
"""Generate bilingual, fact-only facility pages for the public map."""

from __future__ import annotations

import heapq
import html
import json
import re
import shutil
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from string import Template
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://kimuhixy.com/rvpark-onsen-map"
OG_IMAGE = f"{BASE}/icons/icon-512.png"
TYPE_JA = {"rvpark": "RVパーク", "autocamp": "オートキャンプ場", "onsen": "温泉", "michinoeki": "道の駅", "udon": "うどん店"}
TYPE_EN = {"rvpark": "RV Park", "autocamp": "Auto Campground", "onsen": "Onsen", "michinoeki": "Roadside Station", "udon": "Udon Restaurant"}
PREF_EN = {
    "北海道": "Hokkaido", "青森県": "Aomori", "岩手県": "Iwate", "宮城県": "Miyagi", "秋田県": "Akita", "山形県": "Yamagata", "福島県": "Fukushima",
    "茨城県": "Ibaraki", "栃木県": "Tochigi", "群馬県": "Gunma", "埼玉県": "Saitama", "千葉県": "Chiba", "東京都": "Tokyo", "神奈川県": "Kanagawa",
    "新潟県": "Niigata", "富山県": "Toyama", "石川県": "Ishikawa", "福井県": "Fukui", "山梨県": "Yamanashi", "長野県": "Nagano", "岐阜県": "Gifu",
    "静岡県": "Shizuoka", "愛知県": "Aichi", "三重県": "Mie", "滋賀県": "Shiga", "京都府": "Kyoto", "大阪府": "Osaka", "兵庫県": "Hyogo",
    "奈良県": "Nara", "和歌山県": "Wakayama", "鳥取県": "Tottori", "島根県": "Shimane", "岡山県": "Okayama", "広島県": "Hiroshima", "山口県": "Yamaguchi",
    "徳島県": "Tokushima", "香川県": "Kagawa", "愛媛県": "Ehime", "高知県": "Kochi", "福岡県": "Fukuoka", "佐賀県": "Saga", "長崎県": "Nagasaki",
    "熊本県": "Kumamoto", "大分県": "Oita", "宮崎県": "Miyazaki", "鹿児島県": "Kagoshima", "沖縄県": "Okinawa",
}


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def load_data() -> list[dict]:
    payload = json.loads((ROOT / "data/spots.json").read_text(encoding="utf-8"))
    records = payload["spots"]
    required = {"id", "type", "name", "lat", "lng"}
    for position, record in enumerate(records, 1):
        missing = required - record.keys()
        if missing:
            raise ValueError(f"record {position} missing {sorted(missing)}")
        if record["type"] not in TYPE_JA:
            raise ValueError(f"record {position} has unknown type {record['type']}")
    if len({record["id"] for record in records}) != len(records):
        raise ValueError("duplicate spot IDs")
    return records


def slugify(record: dict) -> str:
    raw = f'{record["id"]}-{record["name"]}'
    normalized = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", normalized).strip("-") or re.sub(r"[^a-z0-9]+", "-", record["id"].lower()).strip("-")


def type_label(record: dict, english: bool) -> str:
    return (TYPE_EN if english else TYPE_JA)[record["type"]]


def prefecture(record: dict, english: bool) -> str:
    value = record.get("pref") or ""
    return PREF_EN.get(value, value) if english else value


def safe_website(record: dict) -> str:
    raw = record.get("website")
    if not raw:
        return ""
    first = str(raw).strip().split()[0].split(",")[0].split(";")[0]
    value = first if re.match(r"^https?://", first, re.I) else f"https://{first}"
    parsed = urlsplit(value)
    return value if parsed.scheme in {"http", "https"} and parsed.netloc else ""


def subject(record: dict, english: bool, duplicate_names: set[str]) -> str:
    place = prefecture(record, english)
    coordinates = f'{record["lat"]:.4f}, {record["lng"]:.4f}' if record["name"] in duplicate_names else ""
    record_id = f'ID {record["id"]}' if record["name"] in duplicate_names else ""
    detail = " · ".join(part for part in (place, coordinates, record_id, type_label(record, english)) if part)
    return f'{record["name"]} — {detail}'


def meta_description(record: dict, english: bool, duplicate_names: set[str]) -> str:
    kind = type_label(record, english)
    place = prefecture(record, english) or ("Japan" if english else "日本")
    name = f'{record["name"]} (ID {record["id"]})' if record["name"] in duplicate_names else record["name"]
    if english:
        text = f'{name} is listed in {place}. Facility type: {kind}. View its map coordinates and available website link. Map app interface is in Japanese.'
    else:
        text = f'{name}は{place}の{kind}として掲載されています。地図座標とウェブサイト情報を確認できます。利用条件は施設の最新情報をご確認ください。'
    if record["name"] in duplicate_names:
        text += f' ({record["lat"]:.4f}, {record["lng"]:.4f})'
    return text if len(text) <= 155 else text[:154].rstrip() + "…"


def related_indices(records: list[dict]) -> list[list[int]]:
    by_type: dict[str, list[int]] = defaultdict(list)
    for i, record in enumerate(records):
        by_type[record["type"]].append(i)
    result = []
    for i, item in enumerate(records):
        candidates = (j for j in by_type[item["type"]] if j != i)
        result.append(heapq.nsmallest(6, candidates, key=lambda j: ((records[j]["lat"] - item["lat"]) ** 2 + (records[j]["lng"] - item["lng"]) ** 2, records[j]["id"])))
    return result


def fact(label: str, value: object) -> str:
    return f"<div><dt>{esc(label)}</dt><dd>{esc(value)}</dd></div>"


def schema(record: dict, slug: str, english: bool, duplicate_names: set[str]) -> str:
    prefix = "en/" if english else ""
    lang = "en" if english else "ja"
    canonical = f"{BASE}/{prefix}items/{slug}/"
    place_id = f"{canonical}#place"
    place = {
        "@type": "Place", "@id": place_id, "name": record["name"], "url": canonical,
        "geo": {"@type": "GeoCoordinates", "latitude": record["lat"], "longitude": record["lng"]},
        "additionalProperty": {"@type": "PropertyValue", "name": "Facility type", "value": type_label(record, english)},
    }
    pref = prefecture(record, english)
    if pref:
        place["address"] = {"@type": "PostalAddress", "addressRegion": pref, "addressCountry": "JP"}
    website = safe_website(record)
    if website:
        place["sameAs"] = website
    title = subject(record, english, duplicate_names)
    graph = [
        {"@type": "WebSite", "@id": f"{BASE}/#website", "url": f"{BASE}/", "name": "RV Park & Onsen Map" if english else "RVパーク・温泉マップ", "inLanguage": ["ja", "en"]},
        {"@type": "WebPage", "@id": f"{canonical}#webpage", "url": canonical, "name": title, "inLanguage": lang, "isPartOf": {"@id": f"{BASE}/#website"}, "mainEntity": {"@id": place_id}},
        place,
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Map (Japanese UI)" if english else "地図", "item": f"{BASE}/"},
            {"@type": "ListItem", "position": 2, "name": "Facility index" if english else "施設索引", "item": f"{BASE}/{prefix}items/"},
            {"@type": "ListItem", "position": 3, "name": title, "item": canonical},
        ]},
    ]
    return json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def detail_context(record: dict, slug: str, related: list[int], records: list[dict], slugs: list[str], english: bool, duplicate_names: set[str]) -> dict[str, str]:
    kind = type_label(record, english)
    title = subject(record, english, duplicate_names)
    facts = fact("Facility type" if english else "施設種別", kind)
    pref = prefecture(record, english)
    if pref:
        facts += fact("Prefecture" if english else "都道府県", pref)
    facts += fact("Coordinates" if english else "地図座標", f'{record["lat"]}, {record["lng"]}')
    website = safe_website(record)
    website_link = f'<a class="secondary-action" href="{esc(website)}" target="_blank" rel="noopener noreferrer">Website</a>' if english and website else f'<a class="secondary-action" href="{esc(website)}" target="_blank" rel="noopener noreferrer">ウェブサイト</a>' if website else ""
    links = "".join(f'<li><a href="../{slugs[i]}/">{esc(subject(records[i], english, duplicate_names))}</a></li>' for i in related)
    osm_url = f'https://www.openstreetmap.org/?mlat={record["lat"]}&mlon={record["lng"]}#map=16/{record["lat"]}/{record["lng"]}'
    prefix = "en/" if english else ""
    return {
        "slug": slug, "title": esc(title), "page_title": esc(f'{title} | {"RV Park & Onsen Map" if english else "RVパーク・温泉マップ"}'),
        "meta_description": esc(meta_description(record, english, duplicate_names)), "canonical": f"{BASE}/{prefix}items/{slug}/",
        "ja_url": f"{BASE}/items/{slug}/", "en_url": f"{BASE}/en/items/{slug}/", "og_image": OG_IMAGE,
        "json_ld": schema(record, slug, english, duplicate_names), "type_label": esc(kind), "facts": facts,
        "app_url": f'../../?id={record["id"]}' if not english else f'../../../?id={record["id"]}', "osm_url": esc(osm_url),
        "website_link": website_link, "related": links,
    }


def index_groups(records: list[dict], slugs: list[str], english: bool) -> str:
    grouped: dict[str, dict[str, list[tuple[str, str]]]] = defaultdict(lambda: defaultdict(list))
    for record, slug in zip(records, slugs):
        kind = type_label(record, english)
        area = prefecture(record, english) or ("Prefecture unavailable" if english else "都道府県情報なし")
        grouped[kind][area].append((record["name"], slug))
    sections = []
    order = TYPE_EN.values() if english else TYPE_JA.values()
    for kind in order:
        areas = []
        for area in sorted(grouped[kind]):
            links = "".join(f'<li><a href="{slug}/">{esc(name)}</a></li>' for name, slug in sorted(grouped[kind][area], key=lambda x: (x[0], x[1])))
            areas.append(f'<section class="area-group"><h3>{esc(area)}</h3><ul>{links}</ul></section>')
        sections.append(f'<section class="type-group"><h2>{esc(kind)}</h2>{"".join(areas)}</section>')
    return "".join(sections)


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8")


def main() -> None:
    records = load_data()
    slugs = [slugify(record) for record in records]
    if len(slugs) != len(set(slugs)):
        raise ValueError("duplicate slugs")
    duplicate_names = {name for name, count in Counter(record["name"] for record in records).items() if count > 1}
    related = related_indices(records)
    templates = {name: Template((ROOT / f"templates/{name}.html").read_text(encoding="utf-8")) for name in ("detail_ja", "detail_en", "index_ja", "index_en")}
    for directory in (ROOT / "items", ROOT / "en/items"):
        if directory.exists():
            shutil.rmtree(directory)
    for i, (record, slug) in enumerate(zip(records, slugs)):
        write(ROOT / "items" / slug / "index.html", templates["detail_ja"].substitute(detail_context(record, slug, related[i], records, slugs, False, duplicate_names)))
        write(ROOT / "en/items" / slug / "index.html", templates["detail_en"].substitute(detail_context(record, slug, related[i], records, slugs, True, duplicate_names)))
    common = {"count": f"{len(records):,}", "ja_url": f"{BASE}/items/", "en_url": f"{BASE}/en/items/"}
    write(ROOT / "items/index.html", templates["index_ja"].substitute(common, groups=index_groups(records, slugs, False)))
    write(ROOT / "en/items/index.html", templates["index_en"].substitute(common, groups=index_groups(records, slugs, True)))
    urls = [f"{BASE}/", f"{BASE}/about.html", f"{BASE}/privacy.html", f"{BASE}/en/privacy.html", f"{BASE}/items/", f"{BASE}/en/items/"]
    urls += [f"{BASE}/items/{slug}/" for slug in slugs] + [f"{BASE}/en/items/{slug}/" for slug in slugs]
    sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(f"  <url><loc>{esc(url)}</loc></url>\n" for url in urls) + "</urlset>\n"
    write(ROOT / "sitemap.xml", sitemap)
    write(ROOT / "robots.txt", f"User-agent: *\nAllow: /\n\nSitemap: {BASE}/sitemap.xml\n")
    print(f"Generated {len(records) * 2:,} detail pages, 2 indexes, and {len(urls):,} sitemap URLs.")


if __name__ == "__main__":
    main()
