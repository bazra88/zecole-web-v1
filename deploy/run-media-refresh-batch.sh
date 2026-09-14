#!/bin/bash
# crontab이 00/06/12/18시에 한 번씩 실행 — 세션당 150개, 딜레이 30초로 배치 처리 후 종료.
# 200개/6시간 조합으로 실험해봤지만 09-14 12:00에 1,130개(37시간)에서 또 차단됨 —
# 세션 크기·쿨다운 길이보다 누적 총량 자체가 문턱값으로 보여서, 몇 달간 무차단으로
# 검증됐던 KRW 배치 크론의 원래 조합(150개/6시간)으로 되돌린다(2026-09-14, 사용자 요청).
cd "$(dirname "$0")/.."

LOG="logs/media-refresh-$(date +%Y%m%d-%H%M%S).log"
mkdir -p logs
echo "=== $(date) 시작 ===" >> "$LOG"
/usr/bin/node scripts/refresh-game-catalog.mjs --limit=150 --delay-ms=30000 >> "$LOG" 2>&1
echo "=== $(date) 종료 ===" >> "$LOG"
# 30일 넘은 로그는 정리
find logs -name "media-refresh-*.log" -mtime +30 -delete
