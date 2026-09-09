import Link from "next/link";

export default function SectionHeader({
  eyebrow,
  title,
  titleHref,
  description,
  href,
  linkText = "전체보기",
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
      {href ? (
        <Link href={href} className="section-more">
          {linkText} →
        </Link>
      ) : null}
    </div>
  );
}
