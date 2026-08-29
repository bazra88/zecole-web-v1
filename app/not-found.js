import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container page">
      <div className="error-panel">
        <strong>페이지를 찾을 수 없습니다.</strong>
        <p>주소가 바뀌었거나 삭제된 페이지일 수 있습니다.</p>
        <Link href="/">ZECOLE 홈으로 →</Link>
      </div>
    </main>
  );
}
