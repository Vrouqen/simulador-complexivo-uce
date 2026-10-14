import { redirect } from "next/navigation";
import { AdminApp, AdminHeader } from "@/components/Admin";
import { isAdmin } from "@/lib/admin";
import { listBanks } from "@/lib/exam";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await isAdmin())) redirect("/admin/login");
  const banks = await listBanks();
  return (
    <>
      <AdminHeader />
      <main className="page wrap">
        <AdminApp banks={banks.map((b) => ({ slug: b.slug, title: b.title }))} />
      </main>
    </>
  );
}
