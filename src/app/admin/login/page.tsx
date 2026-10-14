import { redirect } from "next/navigation";
import { Brand } from "@/components/Header";
import { AdminLoginForm } from "@/components/Admin";
import { isAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (await isAdmin()) redirect("/admin");
  return (
    <>
      <header className="band"><div className="wrap"><Brand /></div></header>
      <main className="page wrap narrow">
        <AdminLoginForm />
      </main>
    </>
  );
}
