import Header from "@/components/Header";
import "./globals.css";

export const metadata = {
  title: {
    default: "제콜스토어 | ZECOLE STORE",
    template: "%s | ZECOLE",
  },
  description:
    "Meta Quest, Ray-Ban Meta, VR 게임, Horizon+, VR 뉴스와 입문 가이드를 한곳에서 확인하세요.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <Header />
        {children}
        <footer className="footer">
          <div className="container footer-grid">
            <div>
              <strong className="footer-logo">ZECOLE</strong>
              <p>한국어 VR 정보 · 게임 · 구매 허브</p>
            </div>
            <div className="footer-links">
              <a href="/games">VR 게임</a>
              <a href="/horizon-plus">Horizon+</a>
              <a href="/guide">입문 가이드</a>
              <a href="/business">비즈니스 문의</a>
            </div>
            <div className="affiliate-copy">
              일부 링크는 제휴 링크이며, 구매 시 ZECOLE이 수수료를 받을 수
              있습니다.
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
