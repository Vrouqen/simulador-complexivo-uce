import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="brand">
      <span className="brand-mark">UCE</span>
      <span>
        <b>Simulador Complexivo</b>
        <span>Ingeniería en Sistemas de Información</span>
      </span>
    </Link>
  );
}

export function PublicHeader() {
  return (
    <header className="band">
      <div className="wrap">
        <Brand />
        <nav>
          <Link href="/activar">Activar licencia</Link>
          <Link href="/ingresar" className="cta">Ingresar</Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <div className="wrap row between">
        <span>© {new Date().getFullYear()} Simulador Complexivo UCE · Material de práctica independiente.</span>
        <span>Licencia personal e intransferible.</span>
      </div>
    </footer>
  );
}
