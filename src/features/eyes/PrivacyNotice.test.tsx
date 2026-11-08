import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrivacyNotice } from "./PrivacyNotice";

describe("PrivacyNotice", () => {
  it("says a camera is in use, without audio or face recognition, in its one closed line", () => {
    const { container } = render(<PrivacyNotice />);
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(screen.getByText("Kamera i bruk.")).toBeTruthy();
    expect(container.querySelector("summary")?.textContent).toMatch(/Ingen lyd, ingen ansiktsgjenkjenning/);
  });

  it("opens to the purpose, what is sent where, the Personer switch and who is responsible", () => {
    const { container } = render(<PrivacyNotice />);
    fireEvent.click(screen.getByText("Personvern"));
    const text = container.textContent ?? "";
    expect(text).toMatch(/Formål:/);
    expect(text).toMatch(/Claude \(Anthropic, USA/);
    expect(text).toMatch(/også folk/);
    expect(text).toMatch(/Personer:/);
    expect(text).toMatch(/Behandlingsansvarlig: hotellet/);
  });
});
