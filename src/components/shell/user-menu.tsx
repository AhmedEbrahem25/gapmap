import { LogOut } from "lucide-react";
import { logout } from "@/lib/actions/auth";
import { initials } from "@/lib/utils";
import type { CurrentUser } from "@/lib/auth";

export function UserMenu({ user }: { user: CurrentUser }) {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[13px] font-semibold text-primary-800">
        {initials(user.name)}
      </span>
      <span className="min-w-0 flex-1 text-[13px] leading-[18px]">
        <strong className="block truncate">{user.name}</strong>
        <span className="block truncate text-ink-2">{user.title ?? user.role}</span>
      </span>
      <form action={logout}>
        <button data-tour="sign-out" aria-label="Sign out" title="Sign out" className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-ground hover:text-ink">
          <LogOut size={16} />
        </button>
      </form>
    </div>
  );
}
