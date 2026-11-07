"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button, cx } from "@/ui";
import { hardNavigate } from "./navigate";

const UNAVAILABLE = "Innlogging er ikke satt opp på serveren. Ingen kan logge inn før oppsettet er ferdig.";
const NETWORK = "Fikk ikke svar fra serveren. Sjekk nettet og prøv igjen.";
const FALLBACK = "Fikk ikke logget inn. Prøv igjen.";

const INPUT = cx(
  "min-h-12 w-full rounded-md border border-line-strong bg-surface px-4 text-base text-text",
  "transition-colors duration-150 ease-standard aria-[invalid=true]:border-danger",
);

/** Username, password, "Logg inn". Keeps what was typed on an error; a full page load on success. */
export function LoginForm({ next, unavailable }: { next: string; unavailable: boolean }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(unavailable ? UNAVAILABLE : null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || unavailable) return;
    if (!username.trim() || !password) {
      setError("Skriv inn brukernavn og passord.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, next }),
        credentials: "same-origin",
      });
      const body = (await response.json().catch(() => ({}))) as { next?: unknown; error?: unknown };
      if (response.ok && typeof body.next === "string") {
        // Stays in the loading state until the next page has loaded.
        hardNavigate(body.next);
        return;
      }
      setError(typeof body.error === "string" ? body.error : FALLBACK);
    } catch {
      setError(NETWORK);
    }
    setPending(false);
    passwordRef.current?.focus();
    passwordRef.current?.select();
  }

  const invalid = Boolean(error) && !unavailable;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="login-username" className="text-sm font-semibold">
          Brukernavn
        </label>
        <input
          id="login-username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={24}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={error ? "login-error" : undefined}
          className={INPUT}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="login-password" className="text-sm font-semibold">
          Passord
        </label>
        <div className="relative">
          <input
            ref={passwordRef}
            id="login-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={error ? "login-error" : undefined}
            className={cx(INPUT, "pr-20")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((shown) => !shown)}
            aria-controls="login-password"
            aria-label={showPassword ? "Skjul passord" : "Vis passord"}
            className="absolute inset-y-0.5 right-0.5 min-w-14 rounded-sm px-3 text-sm font-semibold text-muted transition-colors duration-150 ease-standard hover:bg-sunken hover:text-text"
          >
            {showPassword ? "Skjul" : "Vis"}
          </button>
        </div>
      </div>

      {error && (
        <p id="login-error" role="alert" className="rounded-sm border-l-4 border-danger bg-danger-soft px-4 py-3 text-sm text-text">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" loading={pending} disabled={unavailable} className="w-full">
        Logg inn
      </Button>
    </form>
  );
}
