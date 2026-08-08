import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";

export function MarketingNavbar() {
  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-border">
      <div className="mx-auto max-w-6xl px-5 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/">
          <Logo size={30} showWordmark />
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-text-secondary">
          <a href="#problem" className="hover:text-text-primary transition-colors duration-200">
            Problem
          </a>
          <a href="#solution" className="hover:text-text-primary transition-colors duration-200">
            Solution
          </a>
          <a href="#" className="hover:text-text-primary transition-colors duration-200">
            Hardware
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="primary" size="sm">
              Launch Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
