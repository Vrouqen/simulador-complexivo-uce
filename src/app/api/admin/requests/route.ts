import { listRequests, requireAdmin } from "@/lib/admin";
import { ok, route } from "@/lib/http";

export const GET = route(async (req: Request) => {
  await requireAdmin();
  return ok(await listRequests(new URL(req.url).searchParams.get("status") || "pending"));
});
