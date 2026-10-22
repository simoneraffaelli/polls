import Link from "next/link";

export function LinkCard({
  href,
  eyebrow,
  title,
  description,
}: {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <Link className="link-card" href={href}>
      <span className="eyebrow">{eyebrow}</span>
      <span className="link-card-title">
        {title}
        <span aria-hidden="true"> ↗</span>
      </span>
      <span className="muted">{description}</span>
    </Link>
  );
}
