# -*- coding: utf-8 -*-
"""
한경 컨센서스 데일리 리포트 자동 발행
=====================================
매일 https://markets.hankyung.com/consensus (구 consensus.hankyung.com) 의
당일 리포트를 기업 / 산업 / 시장 / 경제 4개 카테고리로 수집해
카테고리별 요약 글(HTML)을 data/auto/YYYY-MM-DD.json 으로 저장하고,
최근 14일치를 합친 data/auto/latest.json 을 갱신합니다.
프론트엔드(app.js)는 latest.json 을 읽어 "리포트" 섹션에 자동 표시합니다.

환경변수
  ANTHROPIC_API_KEY  (선택) 있으면 Claude로 자연어 요약 생성, 없으면 구조화 다이제스트만
  ANTHROPIC_MODEL    (선택) 기본 claude-sonnet-4-6
  REPORT_DATE        (선택) YYYY-MM-DD, 기본 오늘(KST)
"""
import json
import os
import re
import sys
import time
import html as html_mod
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

KST = timezone(timedelta(hours=9))
ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "auto"
OUT_DIR.mkdir(parents=True, exist_ok=True)

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
    "Referer": "https://markets.hankyung.com/consensus",
}

CATEGORIES = [
    # (코드, 한글명, 태그)
    ("CO", "기업", "기업리포트"),
    ("IN", "산업", "산업리포트"),
    ("MK", "시장", "시장리포트"),
    ("EC", "경제", "경제리포트"),
]

LIST_HOSTS = [
    "https://consensus.hankyung.com",
    "http://consensus.hankyung.com",
    "https://hkconsensus.hankyung.com",
    "http://hkconsensus.hankyung.com",
]


def log(*a):
    print("[daily_reports]", *a, flush=True)


def fetch_category_list(code: str, date_str: str):
    """카테고리별 당일 리포트 목록. 여러 호스트/경로를 순서대로 시도."""
    session = requests.Session()
    session.headers.update(HEADERS)
    paths = [
        "/analysis/list?sdate={d}&edate={d}&now_page={p}&pagenum=80&search_text=&search_value=&report_type={c}&order_type=",
        "/apps.analysis/analysis.list?sdate={d}&edate={d}&now_page={p}&pagenum=80&search_text=&report_type={c}&order_type=",
    ]
    for host in LIST_HOSTS:
        for path in paths:
            items, page = [], 1
            try:
                while page <= 5:  # 안전상 최대 5페이지
                    url = host + path.format(d=date_str, p=page, c=code)
                    r = session.get(url, timeout=20)
                    if r.status_code != 200:
                        raise RuntimeError(f"HTTP {r.status_code}")
                    if r.encoding is None or r.encoding.lower() in ("iso-8859-1",):
                        r.encoding = r.apparent_encoding
                    rows = parse_list_html(r.text, host)
                    if not rows:
                        break
                    items.extend(rows)
                    if len(rows) < 80:
                        break
                    page += 1
                if items:
                    log(f"  {code}: {host} 에서 {len(items)}건 수집")
                    return dedupe(items)
            except Exception as e:
                log(f"  {code}: {host}{path.split('?')[0]} 실패 → {e}")
                continue
    return []


def parse_list_html(text: str, base: str):
    """구 컨센서스 목록 테이블 파싱 (컬럼: 작성일/분류/제목/적정가격/투자의견/작성자/제공출처/첨부).
    구조 변화에 대비해 헤더 텍스트로 컬럼 인덱스를 찾고, 실패 시 위치 기반으로 파싱."""
    soup = BeautifulSoup(text, "html.parser")
    table = None
    for t in soup.find_all("table"):
        head_txt = t.get_text(" ", strip=True)
        if "제목" in head_txt and ("투자의견" in head_txt or "작성자" in head_txt or "제공출처" in head_txt):
            table = t
            break
    if table is None:
        return []

    # 헤더 → 컬럼 인덱스 매핑
    idx = {}
    header = table.find("tr")
    if header:
        for i, th in enumerate(header.find_all(["th", "td"])):
            h = th.get_text(strip=True)
            for key, names in {
                "date": ("작성일", "날짜"), "cat": ("분류",), "title": ("제목",),
                "price": ("적정가격", "목표주가", "적정주가"), "opinion": ("투자의견",),
                "author": ("작성자", "애널리스트"), "src": ("제공출처", "발행기관", "증권사"),
            }.items():
                if any(n in h for n in names):
                    idx.setdefault(key, i)

    out = []
    for tr in table.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 4:
            continue
        a = tr.find("a", href=True)
        title = a.get_text(" ", strip=True) if a else ""
        if not title:
            # 링크 없는 행(빈 행/광고 등) 스킵
            continue
        link = a["href"]
        if link.startswith("/"):
            link = base + link
        elif not link.startswith("http"):
            link = base + "/" + link

        def cell(key, fallback_i):
            i = idx.get(key, fallback_i)
            if i is not None and i < len(tds):
                return tds[i].get_text(" ", strip=True)
            return ""

        out.append({
            "date":    cell("date", 0),
            "title":   title,
            "price":   cell("price", None),
            "opinion": cell("opinion", None),
            "author":  cell("author", None),
            "broker":  cell("src", None),
            "link":    link,
        })
    return out


def dedupe(items):
    seen, out = set(), []
    for it in items:
        key = (it["title"], it.get("broker", ""))
        if key in seen:
            continue
        seen.add(key)
        out.append(it)
    return out


# ---------------------------------------------------------------- 요약(LLM)
def claude_summary(cat_name: str, date_str: str, items: list) -> str:
    """ANTHROPIC_API_KEY 가 있으면 Claude로 한국어 요약 HTML 생성. 실패/미설정 시 빈 문자열."""
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        return ""
    model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
    lines = []
    for it in items[:60]:
        seg = f"- {it['title']}"
        extra = " / ".join(x for x in (it.get("broker"), it.get("opinion"), it.get("price")) if x)
        if extra:
            seg += f" ({extra})"
        lines.append(seg)
    prompt = f"""다음은 {date_str} 한경 컨센서스에 올라온 '{cat_name}' 카테고리 증권사 리포트 목록입니다 (제목 / 증권사 / 투자의견 / 목표주가).

{chr(10).join(lines)}

이 목록을 바탕으로 개인 투자자용 데일리 브리핑을 한국어로 작성하세요. 요구사항:
1. 오늘의 핵심 테마 2~4개를 뽑아 각각 2~3문장으로 정리
2. 목표주가 상향/하향, 투자의견 변경 등 눈에 띄는 리포트가 있으면 짚어주기
3. 전반적인 커버리지 톤(강세/중립/약세) 한 줄 평
4. 목록에 없는 내용을 지어내지 말 것. 제목에서 유추 가능한 범위만 서술
5. 출력은 HTML 조각만: <h3>, <p>, <ul>, <li>, <b> 태그만 사용. 마크다운·코드펜스·인사말 금지"""
    try:
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 1500,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=120,
        )
        r.raise_for_status()
        data = r.json()
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
        text = re.sub(r"^```(?:html)?|```$", "", text, flags=re.M).strip()
        # 허용 태그 외 제거(간단 필터)
        text = re.sub(r"<(?!/?(h3|p|ul|li|b)\b)[^>]*>", "", text)
        return text
    except Exception as e:
        log(f"  Claude 요약 실패({cat_name}): {e}")
        return ""


# ---------------------------------------------------------------- 글 생성
def esc(s):
    return html_mod.escape(s or "")


def build_post(code, cat_name, tag, date_str, items):
    up = sum(1 for it in items if "상향" in (it.get("opinion") or "") or "상향" in (it.get("price") or ""))
    down = sum(1 for it in items if "하향" in (it.get("opinion") or "") or "하향" in (it.get("price") or ""))
    brokers = sorted({it.get("broker") for it in items if it.get("broker")})

    summary_html = claude_summary(cat_name, date_str, items)

    rows = "".join(
        f"<li><a href=\"{esc(it['link'])}\" target=\"_blank\" rel=\"noopener\"><b>{esc(it['title'])}</b></a>"
        + " — " + esc(" · ".join(x for x in (it.get('broker'), it.get('opinion'), it.get('price')) if x))
        + "</li>"
        for it in items
    )

    html = (
        f"<p><b>{esc(cat_name)} 리포트 {len(items)}건</b> · 발행기관 {len(brokers)}곳"
        + (f" · 상향 언급 {up}건" if up else "")
        + (f" · 하향 언급 {down}건" if down else "")
        + "</p>"
        + (f"<h3>오늘의 요약</h3>{summary_html}" if summary_html else "")
        + f"<h3>전체 리포트 목록</h3><ul>{rows}</ul>"
        + "<p><i>출처: 한경 컨센서스 (markets.hankyung.com/consensus) · 자동 수집·요약 글입니다. 투자 판단의 책임은 본인에게 있습니다.</i></p>"
    )

    # 기업 카테고리는 제목에서 종목명 추출해 주목 종목 chip 으로
    watch = []
    if code == "CO":
        freq = {}
        for it in items:
            m = re.match(r"^\s*([가-힣A-Za-z0-9&·\- ]{2,20}?)\s*[\(\[]", it["title"])
            if m:
                name = m.group(1).strip()
                if 1 < len(name) <= 15:
                    freq[name] = freq.get(name, 0) + 1
        watch = [k for k, _ in sorted(freq.items(), key=lambda x: -x[1])[:8]]

    return {
        "id": f"auto-{date_str}-{code.lower()}",
        "date": date_str,
        "category": cat_name,
        "title": f"[{cat_name}] 한경 컨센서스 데일리 — {date_str} ({len(items)}건)",
        "meta": "한경 컨센서스 · 자동 발행",
        "html": html,
        "tags": ["자동발행", "한경컨센서스", tag],
        "watch": watch,
        "updated": int(time.time() * 1000),
    }


def rebuild_latest(days=14):
    """최근 N일치 일별 파일을 합쳐 latest.json 재생성."""
    posts = []
    files = sorted(OUT_DIR.glob("20??-??-??.json"), reverse=True)[:days]
    for f in files:
        try:
            j = json.loads(f.read_text(encoding="utf-8"))
            posts.extend(j.get("posts", []))
        except Exception:
            continue
    latest = {"updated": datetime.now(KST).isoformat(), "posts": posts}
    (OUT_DIR / "latest.json").write_text(json.dumps(latest, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"latest.json 갱신 — 총 {len(posts)}개 글 ({len(files)}일치)")


def main():
    date_str = os.environ.get("REPORT_DATE") or datetime.now(KST).strftime("%Y-%m-%d")
    log(f"대상 날짜: {date_str}")

    posts = []
    for code, cat_name, tag in CATEGORIES:
        log(f"수집 시작: {cat_name}({code})")
        items = fetch_category_list(code, date_str)
        if not items:
            log(f"  {cat_name}: 당일 리포트 없음 또는 수집 실패 → 글 생략")
            continue
        posts.append(build_post(code, cat_name, tag, date_str, items))
        time.sleep(1)

    if posts:
        daily = {"date": date_str, "generated": datetime.now(KST).isoformat(), "posts": posts}
        (OUT_DIR / f"{date_str}.json").write_text(json.dumps(daily, ensure_ascii=False, indent=1), encoding="utf-8")
        log(f"{date_str}.json 저장 — {len(posts)}개 카테고리 글")
    else:
        log("발행할 글이 없습니다 (주말/휴장일이거나 수집 실패).")

    rebuild_latest()


if __name__ == "__main__":
    sys.exit(main())
