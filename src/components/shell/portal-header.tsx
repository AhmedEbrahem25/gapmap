import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { logout } from "@/lib/actions/auth";
import type { CurrentUser } from "@/lib/auth";

export function PortalHeader({ user, label }: { user: CurrentUser; label: string }) {
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-5">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Logo />
          </Link>
          <span className="hidden rounded-full bg-ground px-2.5 py-1 text-xs font-semibold text-ink-2 sm:inline">{label}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-right leading-tight sm:block">
            <strong className="block">{user.name}</strong>
            <span className="text-xs text-ink-2">{user.title}</span>
          </span>
          <form action={logout}>
            <button aria-label="Sign out" className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-2 hover:bg-ground">
              <LogOut size={18} />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
