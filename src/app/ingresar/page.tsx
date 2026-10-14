import { redirect } from "next/navigation";
import { LoginForm } from "@/components/AuthForms";
import { Footer, PublicHeader } from "@/components/Header";
import { currentSession } from "@/lib/auth";

export const metadata = { title: "Ingresar" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const { motivo } = await searchParams;
  if (!motivo && (await currentSession()).session) redirect("/panel");
  return (
    <>
      <PublicHeader />
      <main className="page wrap narrow">
        <LoginForm reason={motivo} />
      </main>
      <Footer />
    </>
  );
}
