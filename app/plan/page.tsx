import { AssistedPlanner } from "@/components/assisted-planner";
import { SiteHeader } from "@/components/site-header";

export default function PlanPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <AssistedPlanner />
      </main>
    </>
  );
}
