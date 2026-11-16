import { importMapsUrl } from "@/lib/route-overlay/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body.ok) {
    return Response.json({ error: body.error }, { status: 400 });
  }
  if (typeof body.value.url !== "string") {
    return Response.json({ error: "Field url must be a string." }, { status: 400 });
  }
  const expandShortLinks = body.value.expandShortLinks !== false;
  const outcome = await importMapsUrl(body.value.url, { expandShortLinks });
  if (!outcome.ok) {
    return Response.json({ error: outcome.error }, { status: outcome.status });
  }
  return Response.json(outcome.result);
}

async function readJson(
  request: Request,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const value = (await request.json()) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, error: "Request body must be a JSON object." };
    }
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return { ok: false, error: "Request body must be JSON." };
  }
}
