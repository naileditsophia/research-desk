# -*- coding: utf-8 -*-
"""
CNN Fear & Greed Index 수집 → data/feargreed.json 저장
깃헙 액션이 30분마다 실행. 프론트엔드는 프록시 실패 시 이 파일을 폴백으로 읽는다.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "feargreed.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"),
    "Accept": "application/json",
    "Referer": "https://www.cnn.com/markets/fear-and-greed",
    "Origin": "https://www.cnn.com",
}


def main():
    r = requests.get(URL, headers=HEADERS, timeout=30)
    r.raise_for_status()
    d = r.json().get("fear_and_greed") or {}
    if d.get("score") is None:
        print("score 없음 — 응답 구조 변경 가능성", file=sys.stderr)
        return 1
    payload = {
        "score": round(float(d["score"])),
        "rating": d.get("rating", ""),
        "previous_close": d.get("previous_close"),
        "asOf": d.get("timestamp"),
        "fetched": datetime.now(timezone.utc).isoformat(),
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print("saved:", payload)
    return 0


if __name__ == "__main__":
    sys.exit(main())
