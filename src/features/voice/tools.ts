import { z } from "zod";
import { productBySku, type Product } from "../catalog/products";
import { GUIDE_STEPS, GUIDES, type GuideStep } from "./guides";

export type { GuideStep } from "./guides";

/**
 * What the voice agent may do to the screen. Everything here only *shows* something;
 * `proposeTask` opens a confirm sheet and nothing happens until a person taps Bekreft.
 */
export type VoiceUi = {
  showProduct(product: Product): void;
  showRoute(skus: string[]): void;
  showGuide(step: GuideStep): void;
  /** Opens the confirm sheet. Returns false when a task already waits there: the first one wins. */
  proposeTask(text: string): boolean;
};

export type ClientToolName = "show_product" | "show_route" | "show_guide" | "queue_robot_task";

/** The agent's arguments come from speech: untrusted, so every tool parses them before use. */
export type ClientToolHandler = (params: unknown) => Promise<string>;

export const MAX_ROUTE_STOPS = 7;
export const MAX_TASK_CHARS = 200;

const sku = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase());

const schemas = {
  show_product: z.object({ sku }),
  show_route: z.object({
    skus: z.array(sku).min(1).max(MAX_ROUTE_STOPS),
  }),
  show_guide: z.object({ step: z.enum(GUIDE_STEPS) }),
  queue_robot_task: z.object({
    text: z.string().trim().min(1).max(MAX_TASK_CHARS),
  }),
} as const;

// Replies go back to the agent (which answers in the speaker's language); kept in plain bokmål.
const REPLY = {
  badProduct: "Feil: oppgi én SKU som tekst, for eksempel FT-1001.",
  unknownSku: (value: string) =>
    `Feil: ${value} er en ukjent SKU. Bruk bare SKU-er fra katalogen, eller spør hva varen heter.`,
  badRoute: `Feil: en rute trenger minst én og høyst ${MAX_ROUTE_STOPS} SKU-er, som en liste med tekst.`,
  badGuide: `Feil: velg én av veiledningene ${GUIDE_STEPS.join(", ")}.`,
  badTask: `Feil: beskriv oppgaven i én kort setning, høyst ${MAX_TASK_CHARS} tegn.`,
  taskPending: "Feil: en oppgave venter allerede på bekreftelse.",
} as const;

export function createClientTools(ui: VoiceUi): Record<ClientToolName, ClientToolHandler> {
  return {
    async show_product(params) {
      const parsed = schemas.show_product.safeParse(params);
      if (!parsed.success) return REPLY.badProduct;
      const product = productBySku(parsed.data.sku);
      if (!product) return REPLY.unknownSku(parsed.data.sku);
      ui.showProduct(product);
      return `Viser ${product.name} (${product.sku}) på skjermen. Den står på ${product.locationLabel}.`;
    },

    async show_route(params) {
      const parsed = schemas.show_route.safeParse(params);
      if (!parsed.success) return REPLY.badRoute;
      const skus = [...new Set(parsed.data.skus)];
      const unknown = skus.filter((value) => !productBySku(value));
      if (unknown.length > 0) return REPLY.unknownSku(unknown.join(", "));
      ui.showRoute(skus);
      return `Viser ${skus.length} stopp på skjermen og legger dem i plukklisten. Ruten åpnes med Vis rute.`;
    },

    async show_guide(params) {
      const parsed = schemas.show_guide.safeParse(params);
      if (!parsed.success) return REPLY.badGuide;
      const guide = GUIDES[parsed.data.step];
      ui.showGuide(parsed.data.step);
      return `Viser veiledningen ${guide.title} med ${guide.steps.length} steg på skjermen.`;
    },

    async queue_robot_task(params) {
      const parsed = schemas.queue_robot_task.safeParse(params);
      if (!parsed.success) return REPLY.badTask;
      if (!ui.proposeTask(parsed.data.text)) return REPLY.taskPending;
      return "Oppgaven er ikke sendt. Den står på skjermen og venter på at en person trykker Bekreft.";
    },
  };
}
