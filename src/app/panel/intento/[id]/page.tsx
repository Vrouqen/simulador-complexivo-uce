import { AttemptPage } from "@/components/Simulator";

export const metadata = { title: "Revisión del intento" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AttemptPage id={id} />;
}
