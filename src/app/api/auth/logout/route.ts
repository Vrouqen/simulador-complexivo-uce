import { logout } from "@/lib/auth";
import { ok, route, sameOrigin } from "@/lib/http";

export const POST = route(async () => {
  await sameOrigin();
  await logout();
  return ok();
});
