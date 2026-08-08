import { Logo } from "@/components/Logo";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-5 lg:px-8 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <Logo size={24} showWordmark />
        <p className="text-sm text-text-secondary">
          Intelligent Robotics for Smarter Agriculture
        </p>
      </div>
    </footer>
  );
}
