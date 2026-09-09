import Link from "next/link";

export default function SectionHeader({
  eyebrow,
  title,
  titleHref,
  description,
  href,
  linkText = "전체보기",
  promoNote = false,
}) {
  return (
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
      {href || promoNote ? (
        <div className="section-header-right">
          {promoNote ? (
            <div className="section-promo-note">
              <span className="quest-promo-code"><b>ZECOLE</b><span>프로모션 코드</span></span>
              <span className="section-promo-text">사용 시 10% 할인</span>
            </div>
          ) : null}
          {href ? (
            <Link href={href} className="section-more">
              {linkText} →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
