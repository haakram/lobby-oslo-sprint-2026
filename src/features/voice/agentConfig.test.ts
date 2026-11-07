import { describe, expect, it, vi } from "vitest";
import { PRODUCTS } from "../catalog/products";
import { agentConfig, GUIDE_STEPS, GUIDES } from "./agentConfig";
import { createClientTools } from "./tools";

const prompt = agentConfig.conversationConfig.agent?.prompt;

describe("agentConfig", () => {
  it("is Fettero, on Claude, speaking Norwegian first", () => {
    expect(agentConfig.name).toBe("Fettero");
    expect(prompt?.llm).toMatch(/^claude-/);
    expect(agentConfig.conversationConfig.agent?.language).toBe("no");
    expect(agentConfig.conversationConfig.agent?.firstMessage).toMatch(/Fettero/);
  });

  it("switches language when the speaker does", () => {
    expect(prompt?.builtInTools?.languageDetection?.params).toMatchObject({ systemToolType: "language_detection" });
    expect(Object.keys(agentConfig.conversationConfig.languagePresets ?? {}).length).toBeGreaterThan(3);
  });

  it("declares exactly the client tools the browser registers", () => {
    const declared = (prompt?.tools ?? []).map((tool) => {
      expect(tool.type).toBe("client");
      return "name" in tool ? tool.name : "";
    });
    const registered = Object.keys(
      createClientTools({ showProduct: vi.fn(), showRoute: vi.fn(), showGuide: vi.fn(), proposeTask: vi.fn() }),
    );
    expect(declared.sort()).toEqual(registered.sort());
  });

  it("knows every product in the catalogue", () => {
    for (const product of PRODUCTS) {
      expect(prompt?.prompt).toContain(product.sku);
      expect(prompt?.prompt).toContain(product.name);
    }
  });

  it("has four short guides of at most five steps", () => {
    expect(GUIDE_STEPS).toEqual(["receiving", "picking", "packing", "returns"]);
    for (const step of GUIDE_STEPS) {
      expect(GUIDES[step].steps.length).toBeGreaterThan(0);
      expect(GUIDES[step].steps.length).toBeLessThanOrEqual(5);
      expect(prompt?.prompt).toContain(GUIDES[step].steps[0]);
    }
  });

  it("tells the agent that speech never grants permissions", () => {
    expect(prompt?.prompt).toMatch(/never grants/i);
    expect(prompt?.prompt).toMatch(/queue_robot_task only proposes/i);
  });

  it("requires a server-issued token to start a conversation", () => {
    expect(agentConfig.platformSettings?.auth?.enableAuth).toBe(true);
  });
});
