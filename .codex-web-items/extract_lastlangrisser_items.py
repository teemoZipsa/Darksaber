import hashlib
import html
import json
import re
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image, ImageChops, ImageStat


ROOT = Path(r"C:\Users\arasoftGJ_01\MyProjects\Darksaber")
PAGES_DIR = ROOT / ".codex-web-items" / "pages"
ICONS_DIR = ROOT / ".codex-web-items" / "icons"
ICONS_PNG_DIR = ROOT / ".codex-web-items" / "icons-png"
OUT_JSON = ROOT / ".codex-web-items" / "lastlangrisser_items.json"
ATLAS = ROOT / "public" / "assets" / "images" / "items" / "darksaber_items.png"
CELL = 32

PAGE_META = {
    65: ("카오시아 마을 무기상점", "상점"),
    66: ("벨퓌어스 마을 무기상점", "상점"),
    67: ("시시리오 마을 무기상점", "상점"),
    68: ("엔트리아 마을 무기상점", "상점"),
    69: ("아리크나 마을 무기상점", "상점"),
    70: ("8단계 아이템 목록", "8단계"),
}

STAT_HEADERS = [
    "이동",
    "공격",
    "방어",
    "공격범위",
    "마법력",
    "마법공격",
    "마법방어",
    "마법범위",
    "지휘범위",
    "명중률",
    "회피율",
]


def clean_text(value: str) -> str:
    value = re.sub(r"<script[\s\S]*?</script>", " ", value, flags=re.I)
    value = re.sub(r"<style[\s\S]*?</style>", " ", value, flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    value = html.unescape(value)
    value = value.replace("\xa0", " ")
    return re.sub(r"\s+", " ", value).strip()


def article_html(raw: str) -> str:
    marker = '<div class="tt_article_useless_p_margin contents_style">'
    start = raw.find(marker)
    if start < 0:
        return raw
    end = raw.find("</article>", start)
    return raw[start:end if end >= 0 else len(raw)]


def split_item_pairs(article: str) -> list[tuple[str, str]]:
    tables = re.findall(r"<TABLE\b[\s\S]*?</TABLE>", article, flags=re.I)
    pairs: list[tuple[str, str]] = []
    i = 0
    while i < len(tables) - 1:
        info = tables[i]
        stats = tables[i + 1]
        info_text = clean_text(info)
        stats_text = clean_text(stats)
        if "장착위" in info_text and "장착레벨" in info_text and "내구력" in info_text and "이동" in stats_text and "회피율" in stats_text:
            pairs.append((info, stats))
            i += 2
        else:
            i += 1
    return pairs


def parse_info(info: str) -> dict | None:
    strong = re.search(r"<STRONG\b[\s\S]*?</STRONG>", info, flags=re.I)
    if not strong:
        return None
    name = clean_text(strong.group(0))
    text = clean_text(info)
    image_match = re.search(r'\bsrc\s*=\s*["\']([^"\']+)["\']', info, flags=re.I)
    image_url = html.unescape(image_match.group(1)) if image_match else ""
    info_match = re.search(
        r"장착위\s*(?P<equip_slot>-?\d+)\s*"
        r"(?P<description>.*?)\s*"
        r"장착레벨\s*(?P<level>-?\d+)\s+"
        r"사용가능\s*클래스\s*:\s*(?P<classes>.*?)\s+"
        r"내구력\s*(?P<durability>-?\d+)",
        text,
    )
    if not info_match:
        return {
            "name": name,
            "imageUrl": image_url,
            "parseStatus": "info_partial",
            "rawInfo": text,
        }
    return {
        "name": name,
        "imageUrl": image_url,
        "equipSlot": int(info_match.group("equip_slot")),
        "description": info_match.group("description"),
        "level": int(info_match.group("level")),
        "classes": info_match.group("classes"),
        "durability": int(info_match.group("durability")),
        "parseStatus": "ok",
    }


def parse_stats(stats: str) -> dict:
    text = clean_text(stats)
    compact_headers = r"\s+".join(STAT_HEADERS)
    match = re.search(compact_headers + r"\s+" + r"\s+".join([r"(-?\d+)"] * len(STAT_HEADERS)), text)
    if not match:
        return {"parseStatus": "stats_partial", "rawStats": text}
    return {
        "parseStatus": "ok",
        **{header: int(match.group(index + 1)) for index, header in enumerate(STAT_HEADERS)},
    }


def load_atlas_cells() -> list[dict]:
    atlas = Image.open(ATLAS).convert("RGBA")
    cells = []
    for row in range(atlas.height // CELL):
        for col in range(atlas.width // CELL):
            crop = atlas.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL)).convert("RGBA")
            if crop.getchannel("A").getbbox() is None:
                continue
            rgb = Image.new("RGB", (CELL, CELL), (0, 0, 0))
            rgb.paste(crop, mask=crop.getchannel("A"))
            cells.append({
                "key": f"cell_{col:02d}_{row:02d}",
                "coord": f"{col},{row}",
                "col": col,
                "row": row,
                "rgb": rgb,
            })
    return cells


def icon_path_for_url(url: str) -> Path:
    parsed = urlparse(url)
    suffix = Path(parsed.path).suffix.lower()
    if suffix not in [".png", ".gif", ".jpg", ".jpeg", ".webp"]:
        suffix = ".png"
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]
    return ICONS_DIR / f"{digest}{suffix}"


def download_icon(url: str) -> Path | None:
    if not url:
        return None
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    out = icon_path_for_url(url)
    if out.exists():
        return out
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=20) as response:
            out.write_bytes(response.read())
        return out
    except Exception:
        return None


def normalize_icon(icon_path: Path | None) -> Path | None:
    if not icon_path or not icon_path.exists():
        return None
    ICONS_PNG_DIR.mkdir(parents=True, exist_ok=True)
    out = ICONS_PNG_DIR / f"{icon_path.stem}.png"
    if out.exists():
        return out
    try:
        icon = Image.open(icon_path).convert("RGBA").resize((CELL, CELL), Image.Resampling.NEAREST)
        icon.save(out)
        return out
    except Exception:
        return None


def match_icon(icon_path: Path | None, atlas_cells: list[dict]) -> dict:
    if not icon_path or not icon_path.exists():
        return {"atlasKey": "", "atlasCoord": "", "matchScore": "", "matchConfidence": "no_icon"}
    try:
        icon = Image.open(icon_path).convert("RGBA").resize((CELL, CELL), Image.Resampling.NEAREST)
    except Exception:
        return {"atlasKey": "", "atlasCoord": "", "matchScore": "", "matchConfidence": "bad_icon"}
    icon_rgb = Image.new("RGB", (CELL, CELL), (0, 0, 0))
    icon_rgb.paste(icon, mask=icon.getchannel("A"))
    ranked = []
    for cell in atlas_cells:
        diff = ImageChops.difference(icon_rgb, cell["rgb"])
        score = sum(ImageStat.Stat(diff).mean) / 3
        ranked.append((score, cell))
    ranked.sort(key=lambda value: value[0])
    score, cell = ranked[0]
    if score > 60:
        return {
            "atlasKey": "",
            "atlasCoord": "",
            "matchScore": round(score, 2),
            "matchConfidence": "no_match",
        }
    if score <= 5:
        confidence = "exact"
    elif score <= 12:
        confidence = "strong"
    elif score <= 25:
        confidence = "medium"
    else:
        confidence = "low"
    return {
        "atlasKey": cell["key"],
        "atlasCoord": cell["coord"],
        "matchScore": round(score, 2),
        "matchConfidence": confidence,
    }


def main() -> None:
    atlas_cells = load_atlas_cells()
    records = []
    for page_id, (source_name, source_kind) in PAGE_META.items():
        raw = (PAGES_DIR / f"{page_id}.html").read_text(encoding="utf-8", errors="ignore")
        article = article_html(raw)
        for index, (info_html, stats_html) in enumerate(split_item_pairs(article), start=1):
            info = parse_info(info_html)
            stats = parse_stats(stats_html)
            if not info:
                continue
            icon_path = download_icon(info.get("imageUrl", ""))
            icon_png = normalize_icon(icon_path)
            match = match_icon(icon_path, atlas_cells)
            records.append({
                "sourcePage": page_id,
                "sourceUrl": f"https://lastlangrisser.tistory.com/{page_id}",
                "sourceName": source_name,
                "sourceKind": source_kind,
                "sourceOrder": index,
                "name": info.get("name", ""),
                "imageUrl": info.get("imageUrl", ""),
                "localIcon": str(icon_png) if icon_png else "",
                "equipSlot": info.get("equipSlot", ""),
                "level": info.get("level", ""),
                "durability": info.get("durability", ""),
                "classes": info.get("classes", ""),
                "description": info.get("description", ""),
                **{header: stats.get(header, "") for header in STAT_HEADERS},
                **match,
                "parseStatus": "ok" if info.get("parseStatus") == "ok" and stats.get("parseStatus") == "ok" else f"{info.get('parseStatus')} / {stats.get('parseStatus')}",
            })
    summary = {}
    for record in records:
        key = record["sourceName"]
        summary.setdefault(key, {"count": 0, "exact": 0, "strong": 0, "medium": 0, "low": 0, "no_match": 0})
        summary[key]["count"] += 1
        if record["matchConfidence"] in summary[key]:
            summary[key][record["matchConfidence"]] += 1
    OUT_JSON.write_text(json.dumps({
        "source": "lastlangrisser.tistory.com/65-70",
        "statHeaders": STAT_HEADERS,
        "summary": summary,
        "items": records,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"items={len(records)}")
    for key, value in summary.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
