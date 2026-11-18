import { Link, Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../features/auth/AuthContext";
import { RoleBadge } from "./RoleBadge";

export function AppLayout() {
  const { user, loading, logout } = useAuth();

  if (loading) return <FullPageMessage text="Loading…" />;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="text-lg font-semibold tracking-tight text-brand-700">
            GapMap
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-600 sm:inline">{user.name}</span>
            <RoleBadge role={user.role} />
            <button
              onClick={logout}
              className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

export function FullPageMessage({ text }: { text: string }) {
  return <div className="flex min-h-screen items-center justify-center text-slate-500">{text}</div>;
}
