# 최근 Meta 게임 2단계 수집기

최근 약 2개월의 출시 게임과 출시 예정 게임을 두 지역에서 나누어 확인합니다.

## 1. 해외 목록 및 기본 정보

GitHub Actions의 `Sync recent Meta games`를 실행하고 확인값으로 `SYNC_META_RECENT`를 입력합니다.

- Meta 스토어 전체 게임 페이지를 출시일순으로 조회합니다.
- 출시 예정 및 예약 주문 게임을 포함합니다.
- 출시된 게임은 최근 62일만 포함합니다.
- Demo와 일반 앱은 제외합니다.
- 기존 게임의 KRW 정보는 덮어쓰지 않습니다.
- 신규 게임은 `official_meta_recent_overseas:*` 상태로 Supabase에 추가합니다.
- 출시 예정 게임은 비활성 상태로 보관하고, 이후 수집에서 출시가 확인되면 자동 활성화합니다.

실행 결과는 `meta-recent-sync-*` 아티팩트의 `latest-report.json`에서 확인할 수 있습니다.

## 2. 한국 가격 확인

해외 단계가 성공한 후 한국 PC에서 시험 실행합니다.

```powershell
npm run data:recent:krw -- --limit=10
```

리포트가 정상이라면 실제 반영합니다.

```powershell
npm run data:recent:krw -- --limit=60 --delay-ms=12000 --apply --confirm=SYNC_META_RECENT_KRW
```

- 한 번에 하나의 한국 상품 상세 주소만 요청합니다.
- 요청 사이에 12~16초의 무작위 간격을 둡니다.
- HTTP 403/429가 2회 연속 발생하면 자동 중단합니다.
- KRW가 확인되면 가격과 한국 스토어 이용 가능 상태를 반영합니다.
- 한국 페이지는 열리지만 KRW 상품이 없으면 한국 미출시로 표시합니다.
