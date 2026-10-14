import { redirect } from "next/navigation";
import { AdminHeader, LicenseDetail } from "@/components/Admin";
import { isAdmin } from "@/lib/admin";
import { listBanks } from "@/lib/exam";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { id } = await params;
  const banks = await listBanks();
  return (
    <>
      <AdminHeader />
      <main className="page wrap">
        <LicenseDetail id={id} banks={banks.map((b) => ({ slug: b.slug, title: b.title }))} />
      </main>
    </>
  );
}
