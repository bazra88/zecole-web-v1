ZECOLE WEB v1 — 완전 새 프로젝트
================================

이 프로젝트는 이전 v0.x 프론트엔드 파일을 재사용하지 않고 처음부터 새로 만들었습니다.

현재 연결된 실제 Supabase 구조
- games: 3,797개
- game_videos
- products
- content_items
- horizon_plus_entries
- business_inquiries
- game-images Storage

메인 순서
1. Hero / Meta Quest / Ray-Ban Meta
2. 제휴 핵심 혜택
3. 신규 출시 게임
4. 인기 유료 VR 게임
5. 인기 무료 VR 게임
6. Horizon+
7. VR 적응 단계별 추천
8. VR 뉴스 / 입문 가이드 / YouTube
9. 비즈니스 문의

중요
- 기존 3,797개 게임, 이미지, 제휴 링크는 그대로 사용합니다.
- 출시일/리뷰수/평점/무료게임 데이터가 비어 있는 부분은 억지로 추정하지 않습니다.
- 한국 원화 가격이 있으면 원화 우선, 지역 제한 게임은 USD + 환산 원화 구조를 지원합니다.
- 기본 할인과 시즌 프로모션 할인을 별도로 읽도록 구성했습니다.
- 비즈니스 문의는 현재 UI만 있으며 아직 DB INSERT를 열지 않았습니다.

실행 방법
1) 압축 해제
2) 폴더에서 run.bat 실행
   또는 CMD:
      npm install
      npm run dev
3) http://localhost:3000

새 프로젝트이므로 이전 폴더에 덮어쓰지 마세요.
