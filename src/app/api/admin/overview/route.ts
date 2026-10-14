import { overview, requireAdmin } from "@/lib/admin";
import { ok, route } from "@/lib/http";

export const GET = route(async () => {
  await requireAdmin();
  return ok(await overview());
});
