import { RequestForm } from "@/components/AuthForms";
import { Footer, PublicHeader } from "@/components/Header";
import { listBanks } from "@/lib/exam";
import { site } from "@/lib/site";

export const metadata = { title: "Solicitar licencia" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const banks = await listBanks().catch(() => []);
  return (
    <>
      <PublicHeader />
      <main className="page wrap medium">
        <div className="card">
          <div className="row between">
            <h2 style={{ color: "var(--navy)", fontSize: "1.1rem" }}>1. Realiza el pago</h2>
            <b style={{ fontSize: "1.3rem", color: "var(--navy)" }}>{site.price}</b>
          </div>
          <div className="payinfo" style={{ marginTop: 10 }}>{site.paymentInfo}</div>
        </div>
        <div style={{ height: 18 }} />
        <RequestForm banks={banks.map((b) => ({ slug: b.slug, title: b.title }))} />
      </main>
      <Footer />
    </>
  );
}
