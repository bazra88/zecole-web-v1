import Header from "@/components/Header";
import { Analytics } from "@vercel/analytics/next";
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
              <strong className="footer-logo">ZECOLE STORE</strong>
              <p>메타 공식제휴 10% 할인 · 게임 정보 · 업계 동향</p>
            </div>
            <div className="footer-links">
              <a href="/games">VR 게임</a>
              <a href="/horizon-plus">Horizon+</a>
              <a href="/guide">입문 가이드</a>
              <a href="/business">비즈니스 문의</a>
            </div>
            <div className="affiliate-copy">
              제휴링크를 통해 구매시 수익금의 일부가 후원됩니다. 후원금은
              전액 메타에서 부담합니다.
            </div>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
