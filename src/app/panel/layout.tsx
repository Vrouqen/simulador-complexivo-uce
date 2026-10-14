import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/Header";
import { LogoutButton, SessionGuard, Watermark } from "@/components/SessionGuard";
import { currentSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const r = await currentSession();
  if (!r.session) redirect(r.reason === "NO_SESSION" ? "/ingresar" : `/ingresar?motivo=${r.reason}`);
  const { license } = r.session;
  const id = license.idNumber ? ` · CI ${license.idNumber.slice(0, 4)}••••${license.idNumber.slice(-2)}` : "";
  return (
    <>
      <header className="band">
        <div className="wrap">
          <Brand href="/panel" />
          <nav>
            <Link href="/panel">Mis bancos</Link>
            <span style={{ opacity: 0.85, fontSize: "0.9rem", padding: "0 6px" }}>{license.fullName}</span>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <SessionGuard />
      <Watermark text={`${license.fullName} · ${license.email}${id}`} />
      {children}
    </>
  );
}
