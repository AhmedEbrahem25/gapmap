import Link from "next/link";
import { LogoMark } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <LogoMark size={44} />
      <h1 className="text-2xl font-bold">We couldn&apos;t find that page</h1>
      <p className="max-w-sm text-sm text-ink-2">It may have moved, or you may not have access to it with this account.</p>
      <Link href="/" className="rounded-[10px] bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">
        Back to GapMap
      </Link>
    </main>
  );
}
