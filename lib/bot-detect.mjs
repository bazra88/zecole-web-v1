// 방문 시 메타 재조회(/api/games/visit, /api/media/trailer)는 하루 한도를 공유한다.
// 9/24 이후에도 크롤러가 매일 110~160개 게임 상세페이지를 훑으며 한도를 소진해서
// (2026-09-28 확인), 자기 신원을 밝히는 봇과 자동화 도구는 갱신 대상에서 뺀다.
const BOT_UA = /bot|crawl|spider|slurp|scrap|yeti|daum|yandex|baidu|headless|lighthouse|pagespeed|inspectiontool|googleother|mediapartners|facebookexternalhit|meta-externalagent|whatsapp|preview|python|curl|wget|http-?client|node-fetch|axios|undici|playwright|puppeteer|selenium|phantom/i;

export function isBotUserAgent(userAgent) {
  return !userAgent || BOT_UA.test(userAgent);
}
