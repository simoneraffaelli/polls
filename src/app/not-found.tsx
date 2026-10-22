import Link from "next/link";
import { homePath } from "@/platform/catalog";

export default function NotFound() {
  return (
    <div className="hero">
      <span className="eyebrow">Pagina non disponibile</span>
      <h1>Questa pagina non esiste.</h1>
      <p>
        La sezione richiesta non è pubblicata.{" "}
        <Link
          href={homePath}
          style={{ color: "var(--accent)", textDecoration: "underline" }}
        >
          Torna alla homepage
        </Link>
        .
      </p>
    </div>
  );
}
