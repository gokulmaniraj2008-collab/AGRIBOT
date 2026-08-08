import { Logo } from "@/components/Logo";

export default function Loading() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
      <Logo size={56} animated />
      <p className="text-sm text-text-secondary">
        Initializing agricultural intelligence...
      </p>
    </div>
  );
}
