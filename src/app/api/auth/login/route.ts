import { login } from "@/lib/auth";
import { body, ok, route, sameOrigin, str } from "@/lib/http";

export const POST = route(async (req: Request) => {
  await sameOrigin();
  const b = await body(req);
  await login({ email: str(b.email, 160), password: String(b.password ?? ""), fp: b.fp });
  return ok();
});
