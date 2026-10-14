import { createLicense, listLicenses, requireAdmin } from "@/lib/admin";
import { body, ok, route, sameOrigin } from "@/lib/http";

export const GET = route(async (req: Request) => {
  await requireAdmin();
  return ok(await listLicenses(new URL(req.url).searchParams.get("q")?.trim() || ""));
});

export const POST = route(async (req: Request) => {
  await sameOrigin();
  await requireAdmin();
  return ok(await createLicense(await body(req)));
});
