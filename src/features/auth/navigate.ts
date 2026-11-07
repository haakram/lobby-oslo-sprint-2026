/**
 * A full page load, not a client-side transition: after login, logout or a view switch every server
 * component (navigation, dashboards) must render again for the new role, and no client state survives.
 */
export function hardNavigate(url: string): void {
  window.location.assign(url);
}
