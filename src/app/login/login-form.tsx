"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/ui/submit-button";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="mt-6 grid gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="grid gap-1.5">
        <label htmlFor="email" className="text-sm font-semibold">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.email}
          required
          className="h-11 rounded-lg border border-[#9ca3af] bg-white px-3 text-base transition outline-none focus:border-primary-600 focus:shadow-glow"
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="password" className="text-sm font-semibold">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 rounded-lg border border-[#9ca3af] bg-white px-3 text-base transition outline-none focus:border-primary-600 focus:shadow-glow"
        />
      </div>
      {state.error ? (
        <p role="alert" className="rounded-lg bg-missing-soft px-3 py-2 text-sm text-missing">
          {state.error}
        </p>
      ) : null}
      <SubmitButton size="lg" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
