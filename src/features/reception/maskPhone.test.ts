import { describe, expect, it } from "vitest";
import { maskPhone, maskPhonesInText, telHref } from "./maskPhone";

describe("maskPhone", () => {
  it("keeps the country code and the last three digits", () => {
    expect(maskPhone("+47 900 00 493")).toBe("+47 ••• •• 493");
    expect(maskPhone("+33 6 12 48 90 14")).toBe("+33 ••• •• 014");
  });

  it("masks a number written without a country code or spaces", () => {
    expect(maskPhone("90000717")).toBe("••• •• 717");
    expect(maskPhone("900 00 305")).toBe("••• •• 305");
  });

  it("never shows more than the last three digits", () => {
    for (const phone of ["+47 900 00 493", "90000717", "0047 90000444", "+46 70 123 45 67"]) {
      const digits = maskPhone(phone).replace(/^\+\d{1,3} /, "").replace(/\D/g, "");
      expect(digits).toHaveLength(3);
    }
  });

  it("leaves text that is not a phone number alone", () => {
    expect(maskPhone("Ukjent")).toBe("Ukjent");
    expect(maskPhone("214")).toBe("214");
  });
});

describe("maskPhonesInText", () => {
  it("masks numbers inside a call summary and keeps the rest", () => {
    expect(maskPhonesInText("Olav ringte fra 90000717 om rom 214.")).toBe("Olav ringte fra ••• •• 717 om rom 214.");
    expect(maskPhonesInText("Ring tilbake på +47 900 00 493 i dag")).toBe("Ring tilbake på +47 ••• •• 493 i dag");
  });

  it("keeps room numbers, dates, times and prices", () => {
    const text = "Rom 214, 20.11.2026–22.11.2026 (2026-11-20), kl. 06:30, 2 900 kr for 2 gjester";
    expect(maskPhonesInText(text)).toBe(text);
  });
});

describe("telHref", () => {
  it("calls the full number back", () => {
    expect(telHref("+47 900 00 493")).toBe("tel:+4790000493");
    expect(telHref("90000717")).toBe("tel:90000717");
  });

  it("is null for anything that is not a phone number", () => {
    expect(telHref("214")).toBeNull();
    expect(telHref("1".repeat(16))).toBeNull();
  });
});
