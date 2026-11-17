import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  return (
    <header className="border-b border-border/80 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <Link href="/" className="group flex items-baseline gap-3">
          <span className="font-heading text-2xl tracking-tight text-foreground">
            RouteOverlay
          </span>
          <span className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
            Local feasibility console
          </span>
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-2 text-sm">
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Import
          </Link>
          <Link
            href="/plan"
            data-testid="plan-nav"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Assisted plan
          </Link>
          <Link
            href="/coverage"
            data-testid="coverage-nav"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Coverage
          </Link>
          <Link
            href="/detours"
            data-testid="detour-nav"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Detours
          </Link>
          <Link
            href="/report"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Feasibility report
          </Link>
        </nav>
      </div>
    </header>
  );
}
