import { Simulator } from "@/components/Simulator";

export const metadata = { title: "Simulador" };

export default async function Page({ params }: { params: Promise<{ bank: string }> }) {
  const { bank } = await params;
  return <Simulator slug={bank} />;
}
