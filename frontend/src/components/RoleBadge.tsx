import type { Role } from "../types/api";

const STYLES: Record<Role, string> = {
  instructor: "bg-brand-100 text-brand-800",
  student: "bg-emerald-100 text-emerald-800",
  coordinator: "bg-amber-100 text-amber-800",
  admin: "bg-slate-200 text-slate-800",
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STYLES[role]}`}>{role}</span>
  );
}
