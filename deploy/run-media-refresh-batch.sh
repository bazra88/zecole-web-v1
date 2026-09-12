#!/bin/bash
# crontab이 00/06/12/18시에 한 번씩 실행 — 세션당 200개, 딜레이 30초로 배치 처리 후 종료.
# KRW 배치 크론(150개/6시간, 몇 달간 무차단 검증됨)과 같은 "상시 루프가 아니라 고정
# 스케줄로 깨워서 한 번만 처리하고 끝내는" 구조로, 세션 크기(200)만 먼저 검증하기 위해
# scripts/refresh-game-catalog.mjs를 2026-09-12에 이 방식으로 바꿨다.
cd "$(dirname "$0")/.."

# 2026-09-12 10:53에 1,065개 성공 후 차단됨 — 하루 쉬고 2026-09-13 00:00부터 재개하기로
# 함(사용자 요청). 그 전 시각에 crontab이 먼저 깨워도 여기서 조용히 건너뛴다.
if [ "$(date +%Y%m%d%H%M)" -lt "202609130000" ]; then
  echo "$(date): 아직 재개 시각(2026-09-13 00:00) 전이라 건너뜁니다."
  exit 0
fi

LOG="logs/media-refresh-$(date +%Y%m%d-%H%M%S).log"
mkdir -p logs
echo "=== $(date) 시작 ===" >> "$LOG"
/usr/bin/node scripts/refresh-game-catalog.mjs --limit=200 --delay-ms=30000 >> "$LOG" 2>&1
echo "=== $(date) 종료 ===" >> "$LOG"
# 30일 넘은 로그는 정리
find logs -name "media-refresh-*.log" -mtime +30 -delete
