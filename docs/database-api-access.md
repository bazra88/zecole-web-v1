# Supabase 명시적 Data API 권한

2026-10-30부터 기존 프로젝트에서도 새 public 테이블의 Data API 권한이 자동으로 부여되지 않습니다. 기존 테이블 권한은 유지됩니다.

- 공식 변경 안내: https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
- 권한과 RLS: https://supabase.com/docs/guides/api/securing-your-api

## 적용 기준

`supabase/api-access-contract.json`이 공개 테이블/뷰, 서버 전용 테이블, 시퀀스, 제한된 RPC의 접근 기준입니다.

- 공개 테이블 12개와 뷰 2개: anon/authenticated는 SELECT만 허용하며 기존 RLS 조건을 유지합니다. 두 뷰는 security_invoker=true입니다.
- business_inquiries, game_visit_refresh, meta_fetch_control, meta_fetch_attempts, visit_refresh_decisions: service_role만 접근합니다.
- 관리자와 수집 서버가 사용하는 테이블: service_role에 SELECT/INSERT/UPDATE/DELETE를 명시합니다. 시퀀스는 USAGE/SELECT가 필요합니다.
- visit_refresh_decisions의 정리 쿼리는 FOR UPDATE SKIP LOCKED를 사용하므로 UPDATE 권한도 필요합니다. 기존 자동 권한이 이 누락을 가리고 있었습니다.
- 기존 서버 RPC 7개는 service_role만 실행합니다. claim_game_visit_refresh_unmetered는 계속 소유자 전용입니다. set_updated_at은 기존 트리거 함수이며 변경 대상이 아닙니다.
- 새 마이그레이션은 기존 행/가격/정책/함수 본문을 바꾸지 않습니다. 기존 자동 권한 중 불필요한 수정·TRUNCATE 등의 권한을 제거하고 위 접근만 명시합니다. 프로젝트의 default privileges 자체는 변경하지 않습니다.

## 새 테이블을 추가할 때

1. Supabase CLI의 현재 --help를 확인하고 `supabase migration new <name>`으로 파일을 만듭니다.
2. 같은 파일에서 테이블 생성, ENABLE ROW LEVEL SECURITY, 필요한 정책, 역할별 GRANT를 함께 작성합니다. 자동 권한이 남아 있는 환경도 고려해 불필요한 권한은 명시적으로 REVOKE합니다.
3. API 접근 기준 JSON에 새 객체와 필요한 권한을 등록합니다. 서버 전용이면 anon/authenticated 배열은 비워 둡니다. authenticated는 관리자를 뜻하지 않습니다.
4. GitHub의 Database API access 검사를 통과시킵니다. 새 객체 누락, RLS 누락, 필요한 GRANT 누락, 과도한 권한, 공개 수정 정책은 실패합니다.
5. 운영에는 검토된 새 마이그레이션만 적용하고 읽기 전용 권한 검증 SQL로 결과를 확인합니다.

읽기 전용 검증 SQL 생성:

```sh
node scripts/check-db-access.mjs --assertions > access-check.sql
```

이 출력은 데이터 변경 없이 권한 메타데이터만 검사합니다. GRANT는 테이블 접근, RLS는 접근한 행에 대한 제한입니다. 둘 다 필요합니다.

## 새 DB의 구조 복원과 검증

`supabase/baselines/public-20261022.sql`은 2026-10-22 운영 DB의 public 구조를 기반으로 한 스냅샷입니다. 테이블 17개, 뷰 2개, 함수 9개, 시퀀스 3개와 제약·인덱스·트리거·RLS 정책을 포함하며 접근 권한은 위 기준으로 명시했습니다. 게임, 문의, 리뷰, 로그 등 실제 행은 포함하지 않습니다.

**빈 public 스키마에서만 사용합니다. 운영 DB에는 실행하지 않습니다.** 기존 테이블/뷰/시퀀스가 있으면 시작 단계에서 실패하도록 되어 있습니다. 이는 전체 Supabase 프로젝트 백업이 아닙니다. Auth 사용자, Storage 파일·정책, 프로젝트 API 설정, 비밀 키와 데이터는 별도 이관 대상입니다.

빈 Supabase 프로젝트에는 anon/authenticated/service_role 역할이 이미 있습니다. 구조 스냅샷 적용 후 파일명 버전이 `20261014081123`보다 큰 마이그레이션만 순서대로 적용합니다. 과거 마이그레이션을 다시 적용하면 중복 생성/열 추가가 발생할 수 있습니다.

처음 서비스를 구성할 때는 실제 데이터 이관 또는 초기 설정도 필요합니다. 메타 수집을 켤 경우 meta_fetch_control의 KRW/USD 설정 행을 검토하여 준비합니다(현재 운영 기준 간격 15초, 시간당 20회, 하루 100회). 스냅샷 자체는 수집을 시작하거나 설정 데이터를 삽입하지 않습니다.

기존 저장소의 과거 마이그레이션에는 초기 테이블 생성이 빠져 있고 일부 파일 버전은 운영 이력과 다릅니다. **그대로 supabase db reset/db push를 실행하는 전체 이력 재생은 아직 지원하지 않습니다.** 이 준비 작업은 별도 스냅샷 + 이후 마이그레이션 경로를 제공합니다. Supabase preview branches/CLI reset에 통합할 때는 격리된 프로젝트에서 초기화 기준과 마이그레이션 이력을 먼저 맞추고 검증해야 합니다. 운영 이력을 자동 repair하거나 기존 파일을 재번호 매기지 않습니다.

## 자동 검사

`.github/workflows/database-access.yml`은 관련 PR과 master 변경 시 일회성 PostgreSQL 17을 시작합니다. 운영 자격 증명 없이 자동 GRANT가 없는 상태에서 스냅샷과 이후 마이그레이션을 적용합니다. 메타 호출, 메일 전송, 정기 수집은 하지 않습니다.

실행 범위:
- 객체별 실제 권한 및 RLS, 뷰의 호출자 권한 적용 확인
- 공개/비공개 게임과 미디어의 조회 정책
- 서버의 문의 저장, 3종 시퀀스 사용, 가격 이력 기록
- 갱신 요청→완료→가격 반영→로그 기록 RPC 흐름
- 방문자/일반 로그인 사용자의 문의 조회 및 게임 수정/수집 RPC 차단
- GRANT 누락과 미분류 테이블을 일부러 만들었을 때 검사 실패
- 기존 스키마에 스냅샷을 재적용하면 차단

로컬 PostgreSQL에서는 비어 있는 `zecole_access_test` DB와 역할 생성 가능한 테스트 사용자만 사용합니다:

```sh
PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=zecole_access_test PGUSER=postgres node scripts/check-db-access.mjs
```

테스트는 실제 PostgREST/GraphQL 서버, Auth 로그인, Storage 또는 배포 전체 흐름을 대신하지 않습니다. 운영 적용 후에는 권한 검사와 공개 API의 읽기 응답을 별도로 확인합니다.

## 2026-10-22 적용 결과

- CLI로 생성한 신규 마이그레이션을 운영에 적용한 뒤 파일 버전을 실제 운영 이력 `20261022095737_explicit_data_api_grants`와 맞췄습니다.
- 로컬 PGlite 0.5.11과 GitHub PostgreSQL 17에서 위 격리 테스트를 통과했습니다.
- 운영 DB에서도 전체 접근 기준 SQL 검증을 통과했습니다.
- 실제 PostgREST에서 공개 테이블 12개와 뷰 2개의 읽기 응답은 모두 200이었습니다. 게임→장르 관계 조회도 200으로 확인했습니다.
- 비공개 테이블 5개는 공개 키로 접근 시 모두 401 / PostgreSQL 42501로 차단되었습니다. 응답 데이터는 수집하지 않았습니다.
- 보안 Advisor에는 기존 서버 전용 테이블 5개의 RLS 정책 없음 정보 알림만 남아 있습니다. 이 테이블은 anon/authenticated 권한이 없고 BYPASSRLS 서버 역할만 접근하므로 공개 정책을 추가하지 않습니다.
- 운영 테이블 데이터, 가격, RLS 정책, 수집 주기, default privileges와 API 노출 스키마 설정은 변경하지 않았습니다. 권한만 명시적으로 정리했습니다.
