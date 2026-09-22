import Link from "next/link";

export default function SectionHeader({
  eyebrow,
  title,
  titleHref,
  description,
  href,
  linkText = "전체보기",
  promoStrip = false,
}) {
  return (
    <>
      <div className="section-header">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>
            {titleHref ? (
              <Link href={titleHref} className="section-title-link">{title}</Link>
            ) : title}
          </h2>
          {description ? <p className="section-description">{description}</p> : null}
        </div>
        {href ? (
          <Link href={href} className="section-more">
            {linkText} →
          </Link>
        ) : null}
      </div>
      {promoStrip ? (
        <p className="section-promo-strip">
          🎟 제휴 할인 대상 게임은 프로모션 코드 <b>ZECOLE</b>로 10% 할인됩니다. Meta 자체 할인 상품에는 중복 적용되지 않습니다.
        </p>
      ) : null}
    </>
  );
}
