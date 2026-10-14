import { ActivateForm } from "@/components/AuthForms";
import { Footer, PublicHeader } from "@/components/Header";

export const metadata = { title: "Activar licencia" };

export default function Page() {
  return (
    <>
      <PublicHeader />
      <main className="page wrap medium">
        <ActivateForm />
      </main>
      <Footer />
    </>
  );
}
