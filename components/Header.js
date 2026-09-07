import Link from "next/link";

export default function Header() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a href="/" className="logo" aria-label="ZECOLE 홈 초기화면으로 이동">
          <span className="logo-text">
            <strong>제콜스토어</strong>
            <span className="logo-sep">|</span>
            <span className="logo-en">Zecole Store</span>
          </span>
        </a>

        <nav className="main-nav" aria-label="주 메뉴">
          <div className="nav-group">
            <Link href="/quest" className="nav-group-label">
              Meta Quest <span className="nav-group-sep">|</span> Ray-Ban Meta
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <div className="nav-dropdown">
              <Link href="/quest">Meta Quest</Link>
              <Link href="/rayban-meta">Ray-Ban Meta</Link>
            </div>
          </div>
          <div className="nav-mobile-primary">
            <Link href="/quest" className="nav-mobile-link">Meta Quest</Link>
            <Link href="/rayban-meta" className="nav-mobile-link">Ray-Ban Meta</Link>
          </div>
          <div className="main-nav-scroll">
            <Link href="/games">VR 게임</Link>
            <Link href="/horizon-plus">Horizon+</Link>
            <Link href="/news">VR 뉴스</Link>
            <Link href="/guide">입문 가이드</Link>
            <Link href="/videos">영상</Link>
          </div>
        </nav>

        <form className="header-search" action="/games" method="get" role="search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            name="q"
            placeholder="원하시는 게임 이름을 검색하세요"
            aria-label="VR 게임 검색"
          />
        </form>

        <Link href="/business" className="header-business">
          비즈니스 문의
        </Link>
      </div>
    </header>
  );
}
