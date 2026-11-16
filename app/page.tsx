import { RouteConsole } from "@/components/route-console";
import { SiteHeader } from "@/components/site-header";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <RouteConsole />
      </main>
    </>
  );
}
