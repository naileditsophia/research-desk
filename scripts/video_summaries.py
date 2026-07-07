# -*- coding: utf-8 -*-
"""
한경 글로벌마켓 시황 영상 자동 요약
===================================
채널 RSS에서 제목에 '빈난새' 또는 '이상은'이 들어간 새 영상을 찾아
자막(스크립트) 전체를 Claude로 요약하고 → 관련 종목 정리 → 시황 코멘트를 붙여
data/auto/videos.json 에 글로 발행합니다. 프론트엔드는 이 파일을 읽어
"시황 영상 요약" 섹션에 자동 표시합니다.

필수 환경변수: ANTHROPIC_API_KEY (요약이 핵심이므로 없으면 실행 중단)
선택: ANTHROPIC_MODEL (기본 claude-sonnet-4-6)
"""
import json
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from youtube_transcript_api import YouTubeTranscriptApi

KST = timezone(timedelta(hours=9))
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "auto" / "videos.json"

CHANNEL_ID = "UCWskYkV4c4S9D__rsfOl2JA"   # 한경 글로벌마켓
RSS_URL = f"https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}"
KEYWORDS = ("빈난새", "이상은")
MAX_ATTEMPTS = 5      # 자막이 늦게 올라오는 경우가 있어 실패 시 다음 실행에서 재시도
MAX_POSTS = 30


def log(*a):
    print("[video_summaries]", *a, flush=True)


def load_state():
    try:
        return json.loads(OUT.read_text(encoding="utf-8"))
    except Exception:
        return {"posts": [], "processed": {}}


def fetch_new_videos(processed):
    r = requests.get(RSS_URL, timeout=20)
    r.raise_for_status()
    ns = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}
    root = ET.fromstring(r.text)
    videos = []
    for entry in root.findall("a:entry", ns):
        vid = entry.findtext("yt:videoId", "", ns)
        title = entry.findtext("a:title", "", ns)
        published = entry.findtext("a:published", "", ns)
        if not vid or not any(k in title for k in KEYWORDS):
            continue
        st = processed.get(vid)
        if st == "done" or (isinstance(st, int) and st >= MAX_ATTEMPTS):
            continue
        videos.append({"vid": vid, "title": title, "published": published})
    return videos


def fetch_transcript(vid):
    fetched = YouTubeTranscriptApi().fetch(vid, languages=["ko", "ko-KR"])
    text = " ".join(s.text.strip() for s in fetched)
    return re.sub(r"\s+", " ", text).strip()[:60000]


def summarize(title, transcript):
    key = os.environ["ANTHROPIC_API_KEY"]
    model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
    prompt = f"""다음은 한경 글로벌마켓 유튜브 영상 「{title}」의 자막 전문입니다.

<자막>
{transcript}
</자막>

이 영상 내용으로 개인 투자자용 시황 글을 작성하세요. 반드시 아래 JSON 형식으로만 응답하세요 (마크다운 코드펜스 금지):

{{"stocks": ["영상에서 언급된 주요 종목명 (한국어, 최대 8개)"], "html": "본문 HTML"}}

본문 HTML 구성 (h3, p, ul, li, b 태그만 사용):
1. <h3>핵심 요약</h3> — 영상 전체 내용을 5~8문장으로 충실히 요약
2. <h3>관련 종목 정리</h3> — <ul>로 종목별 언급 맥락(호재/악재/전망)을 한 줄씩
3. <h3>시황 코멘트</h3> — 오늘 시장 흐름에 대한 종합 코멘트 3~5문장
자막에 없는 내용을 지어내지 마세요."""
    r = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
        json={"model": model, "max_tokens": 3000, "messages": [{"role": "user", "content": prompt}]},
        timeout=180,
    )
    r.raise_for_status()
    text = "".join(b.get("text", "") for b in r.json()["content"] if b.get("type") == "text")
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    j = json.loads(text)
    html = re.sub(r"<(?!/?(h3|p|ul|li|b)\b)[^>]*>", "", j["html"])
    return j.get("stocks", [])[:8], html


def build_post(v, stocks, body_html):
    date = datetime.fromisoformat(v["published"]).astimezone(KST).strftime("%Y-%m-%d")
    url = f"https://www.youtube.com/watch?v={v['vid']}"
    html = (
        f'<p>🎬 <a href="{url}" target="_blank" rel="noopener"><b>{v["title"]}</b></a> (한경 글로벌마켓)</p>'
        + body_html
        + "<p><i>영상 자막 기반 자동 요약 글입니다. 투자 판단의 책임은 본인에게 있습니다.</i></p>"
    )
    return {
        "id": f"auto-video-{v['vid']}",
        "section": "video",
        "date": date,
        "title": f"[영상] {v['title']}",
        "meta": "한경 글로벌마켓 · 자동",
        "html": html,
        "tags": ["자동발행", "시황영상"],
        "watch": stocks,
        "updated": int(time.time() * 1000),
    }


def main():
    if not os.environ.get("ANTHROPIC_API_KEY", "").strip():
        log("ANTHROPIC_API_KEY 미설정 — 영상 요약은 요약 생성이 필수라 종료합니다.")
        return 1

    state = load_state()
    processed = state.get("processed", {})
    videos = fetch_new_videos(processed)
    if not videos:
        log("처리할 새 영상 없음.")
        return 0

    changed = False
    for v in videos:
        log(f"영상 처리: {v['title']} ({v['vid']})")
        try:
            transcript = fetch_transcript(v["vid"])
            log(f"  자막 {len(transcript)}자 확보")
            stocks, body = summarize(v["title"], transcript)
            state["posts"].insert(0, build_post(v, stocks, body))
            processed[v["vid"]] = "done"
            changed = True
            log(f"  발행 완료 · 종목: {', '.join(stocks) or '없음'}")
        except Exception as e:
            processed[v["vid"]] = (processed.get(v["vid"]) or 0) + 1
            changed = True
            log(f"  실패 (시도 {processed[v['vid']]}/{MAX_ATTEMPTS}): {e}")

    if changed:
        state["posts"] = state["posts"][:MAX_POSTS]
        state["processed"] = processed
        state["updated"] = datetime.now(KST).isoformat()
        OUT.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
        log("videos.json 저장 완료")
    return 0


if __name__ == "__main__":
    sys.exit(main())
