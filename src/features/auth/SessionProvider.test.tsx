import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "./types";

vi.mock("./navigate", () => ({ hardNavigate: vi.fn() }));

import { hardNavigate } from "./navigate";
import { SessionProvider, useSession } from "./SessionProvider";

const ADMIN: Session = { user: { u: "hamad", name: "Hamad", role: "admin" }, view: "admin", effectiveRole: "admin", exp: 2_000_000_000 };

function withSession(session: Session | null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <SessionProvider session={session}>{children}</SessionProvider>;
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(hardNavigate).mockReset();
  window.history.replaceState(null, "", "/");
});

describe("useSession", () => {
  it("gives the user, the view and the effective role from the server's session", () => {
    const { result } = renderHook(() => useSession(), { wrapper: withSession(ADMIN) });
    expect(result.current).toMatchObject({
      status: "authenticated",
      user: { u: "hamad", name: "Hamad", role: "admin" },
      view: "admin",
      effectiveRole: "admin",
    });
  });

  it("says whether this is the open demo (no accounts configured); off unless the layout says so", () => {
    expect(renderHook(() => useSession(), { wrapper: withSession(ADMIN) }).result.current.openDemo).toBe(false);
    const openDemo = ({ children }: { children: ReactNode }) => (
      <SessionProvider session={ADMIN} openDemo>
        {children}
      </SessionProvider>
    );
    expect(renderHook(() => useSession(), { wrapper: openDemo }).result.current.openDemo).toBe(true);
    expect(renderHook(() => useSession()).result.current.openDemo).toBe(false);
  });

  it("reads as logged out without a session, and outside a provider (components stay testable)", () => {
    const loggedOut = { status: "unauthenticated", user: null, view: null, effectiveRole: null };
    expect(renderHook(() => useSession(), { wrapper: withSession(null) }).result.current).toMatchObject(loggedOut);
    expect(renderHook(() => useSession()).result.current).toMatchObject(loggedOut);
  });

  it("switchView posts the view and reloads on the same page when that role may open it", async () => {
    window.history.replaceState(null, "", "/ruter?fra=lobby");
    const fetchMock = vi.fn(async () => Response.json({ session: { ...ADMIN, view: "receptionist", effectiveRole: "receptionist" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useSession(), { wrapper: withSession(ADMIN) });
    await act(() => result.current.switchView("receptionist"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/view",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ view: "receptionist" }) }),
    );
    expect(hardNavigate).toHaveBeenCalledWith("/ruter?fra=lobby");
  });

  it("switchView goes home when the new role may not open the current page", async () => {
    window.history.replaceState(null, "", "/hotell");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ session: { ...ADMIN, view: "receptionist", effectiveRole: "receptionist" } })));
    const { result } = renderHook(() => useSession(), { wrapper: withSession(ADMIN) });
    await act(() => result.current.switchView("receptionist"));
    expect(hardNavigate).toHaveBeenCalledWith("/");
  });

  it("switchView throws with the server's message when refused, and does not navigate", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Bare admin kan bytte visning." }, { status: 403 })));
    const { result } = renderHook(() => useSession(), { wrapper: withSession(ADMIN) });
    await expect(result.current.switchView("robot")).rejects.toThrow("Bare admin kan bytte visning.");
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it("logout posts and goes to /login", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useSession(), { wrapper: withSession(ADMIN) });
    await act(() => result.current.logout());
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
    expect(hardNavigate).toHaveBeenCalledWith("/login");
  });
});
