import { reconstructFromUrl } from "@/lib/route-overlay/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  if (typeof record.url !== "string") {
    return Response.json({ error: "Field url must be a string." }, { status: 400 });
  }
  const outcome = await reconstructFromUrl(record.url, record.mode, {
    expandShortLinks: record.expandShortLinks !== false,
  });
  if (!outcome.ok) {
    return Response.json(
      { error: outcome.error, googleApi: outcome.googleApi ?? null },
      { status: outcome.status },
    );
  }
  return Response.json({
    parsed: outcome.parsed,
    recoverability: outcome.recoverability,
    reconstruction: outcome.reconstruction,
  });
}
