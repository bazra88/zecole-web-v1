# Quest Store DB 로컬 보완 수집기

유료게임의 누락된 `krw_price`와 `release_date`만 현재 PC에서 천천히 보완합니다.

- Quest Store DB의 `Crawl-delay: 10`을 지켜 한 번에 하나씩 요청합니다.
- 별점 4점 이상이면서 리뷰 1,000개 이상인 게임을 가장 먼저 처리합니다.
- HTTP 403/429, KRW 3회 연속 미감지, 일반 실패 3회 연속 발생 시 자동 중단합니다.
- 실행 기록은 `.meta-cache/qsdb-local/`에 저장되어 같은 날 실패 항목을 반복 요청하지 않습니다.
- 한국 지역 페이지에 KRW 가격이 없으면 `krw_store_available=false`, `region_restricted=true`로 기록해 한국 스토어 미출시 상태를 명확히 표시하고 반복 요청을 막습니다.
- 기본 하루 한도는 100개입니다.

## 시험 실행

DB를 변경하지 않고 5개만 확인합니다.

```powershell
npm run data:paid:qsdb -- --limit=5
```

## 실제 반영

`.env.local`에 서버 전용 `SUPABASE_SECRET_KEY`가 있어야 합니다. 이 값은 절대 Git에 커밋하지 않습니다.

```powershell
npm run data:paid:qsdb -- --limit=100 --daily-limit=100 --apply --confirm=SYNC_QSDB_METADATA
```

요청 간격을 더 늘리려면 다음처럼 밀리초 단위로 지정합니다.

```powershell
npm run data:paid:qsdb -- --limit=100 --delay-ms=15000 --apply --confirm=SYNC_QSDB_METADATA
```
