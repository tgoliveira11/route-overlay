import { readFile } from "node:fs/promises";
import path from "node:path";
import { SiteHeader } from "@/components/site-header";
import { Markdown } from "@/lib/markdown";

export const dynamic = "force-dynamic";

export default async function ReportPage() {
  const source = await readFile(
    path.join(process.cwd(), "docs", "FEASIBILITY.md"),
    "utf8",
  );
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Markdown source={source} />
      </main>
    </>
  );
}
