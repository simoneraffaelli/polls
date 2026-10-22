import Link from "next/link";

export type NavigationItem = Readonly<{ href: string; label: string }>;

export function EditionNavigation({
  items,
  currentPath,
}: {
  items: readonly NavigationItem[];
  currentPath: string;
}) {
  return (
    <nav className="edition-nav" aria-label="Viste dell'edizione">
      <ul>
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.href === currentPath ? "page" : undefined}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
