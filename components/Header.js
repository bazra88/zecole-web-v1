import Link from "next/link";

export default function Header() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a href="/" className="logo" aria-label="ZECOLE 홈 초기화면으로 이동">
          <span className="logo-mark">Z</span>
          <span className="logo-text">
            <strong>제콜스토어</strong>
            <small>ZECOLE STORE</small>
          </span>
        </a>

        <form className="header-search" action="/games" method="get" role="search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            name="q"
            placeholder="원하시는 게임 이름을 검색하세요"
            aria-label="VR 게임 검색"
          />
        </form>

        <nav className="main-nav" aria-label="주 메뉴">
          <Link href="/quest">Meta Quest</Link>
          <Link href="/rayban-meta">Ray-Ban Meta</Link>
          <Link href="/games">VR 게임</Link>
          <Link href="/horizon-plus">Horizon+</Link>
          <Link href="/news">VR 뉴스</Link>
          <Link href="/guide">입문 가이드</Link>
          <Link href="/videos">영상</Link>
        </nav>

        <Link href="/business" className="header-business">
          비즈니스 문의
        </Link>
      </div>
    </header>
  );
}
