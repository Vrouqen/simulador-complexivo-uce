import { adminLogout } from "@/lib/admin";
import { ok, route } from "@/lib/http";

export const POST = route(async () => {
  await adminLogout();
  return ok();
});
