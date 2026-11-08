# HOLIO.md — Holio pains 3, 6 and 9 in Fettero, with the honest status

> For Holio (the Holio juror and the people at the stand) and for us. Written Sun 8 Nov morning
> from the code on `hamad/jury-loop`. Fettero is a hotel product; this page says plainly which parts
> of it work for a web-shop warehouse today, which parts are hotel stand-ins, and what we would build
> first. The brief: `docs/CONTEXT.md` § 6 and *Hackathon - Holio og utfordringer fra lagerdriften.pdf*.

## In one paragraph

We built one chain that matters to a warehouse: **an item with no barcode → its SKU → the pick list
→ the shortest pick route**, plus work guides spoken in the worker's language. Each link runs in the
app, but on hotel stand-ins: a 12-SKU test catalogue, a 4-shelf test warehouse map, and a voice agent
that isn't connected on our server. There is no warehouse mode, no measured accuracy and no test on a
Zebra yet. If Holio says "one pain, deep", we lead with **3 + 6 as one chain** and call 9 a bonus.

## The three pains, screen by screen

| Pain | Where in Fettero | What works today | Honest status |
|---|---|---|---|
| **3. Recognise a product without a barcode** | **Robotens øyne** (`/oyne`, `src/features/eyes/`) | The phone's camera draws boxes on the device (MediaPipe EfficientDet-Lite0; nothing sent). Tap a box: the crop goes through our server to Claude, which reads the text on the pack and picks the SKU from the catalogue, with what it read and a confidence label (*Sikker / Ganske sikker / Usikker, sjekk varen*). Then *Vis vei* (route to the shelf) or *Legg i plukkliste*. *Identifiser hele bildet* sends the whole frame when no box appears. | **Works with network and a key; not measured.** The catalogue is 12 test SKUs in the prompt (`src/features/catalog/products.ts`), which does not scale. The on-device detector knows COCO classes (bottle, cup, book …), with no class for a carton, polybag or envelope, so most warehouse goods need a tap. The confidence is the model's own label, not calibrated. No accuracy, speed or cost figure exists yet. No bin-label confirmation step. |
| **6. Shortest route / less walking** | **Ruter** (`/ruter`, `src/features/routes/`), tab *Plukkliste* | A TypeScript port of our robot's router (parity tests against the Python agent) finds the shortest round over several floors, by lift when a trolley is in use, and shows the metres saved against the order the list came in. The *Plukkliste* tab is always there and plans a pick round from start and back for the items Øyne or Stemme added; an empty list opens on an example restocking order of 5 SKUs: *70 m spart · 32 % kortere* than the list order. | **Works on a test map.** The warehouse map is 4 shelves on two floors with a packing zone as start (*Testkart*, `TODO(phase-2)`). The hotel cleaning round is the same router on the real night's hotel map. Slotting (moving fast movers closer to packing), the direction Holio's brief suggests, is not built. |
| **9. Guidance in the worker's own language** | **Snakk gjennom roboten** (`/stemme`, `src/features/voice/`) | An ElevenLabs voice agent that answers in eleven languages (bokmål, English, Polish, Ukrainian, Lithuanian, Swedish, Danish, German, Spanish, Arabic, Russian) and four warehouse work guides: *Varemottak, Plukking, Pakking, Retur* (`src/features/voice/guides.ts`). A spoken task for the robot only opens a confirm sheet. | **Built, not running here.** No agent id is set on our server, so the screen says it isn't connected and is hidden or marked in the menu. The guide steps show on screen only in bokmål: a Polish temp hears Polish and reads Norwegian. Guest-to-staff translation is not built. |

## How it would fit Holio Ops

- Holio Ops runs React and TypeScript in Capacitor on Zebra TC27s. Øyne and the pick route are React
  components that call one server route each (`/api/identify`, the router in the browser), so they
  could run in that webview. Untested on a TC27.
- **20,000 SKUs, not 12:** Claude reads the pack (brand, size, colour, any text), a text or embedding
  search over the WMS catalogue returns the top five with photo and bin, and the picker taps one. The
  catalogue never goes in the prompt.
- **A wrong pick is worse than "I don't know":** before *Legg i plukkliste*, the picker scans the
  shelf label to confirm (the industry's pick confirmation), so a wrong guess can't become a wrong
  shipment.
- **Cost:** the whole-frame *Omgivelser* scan adds nothing in a warehouse and costs money per device
  hour; a warehouse mode keeps it off and identifies on a tap.
- **The handover is a warehouse pain too:** the *Overlevering 06:00* page (owners, deadlines, *Kvitter
  mottatt*) has the shape of an evening-to-morning warehouse handover: what wasn't picked, which carrier
  pickup was missed, which returns are waiting.

## What we would do first (and haven't)

1. **Put numbers on pain 3 (about 1 h):** 20 items with no barcode or a torn label through
   `/api/identify`; report right / unsure / wrong, median seconds and cost per scan, with the run file
   in `docs/checks/`. Until then we say "not measured".
2. **A warehouse map and catalogue (about 2 h):** a packing table as start, 5 aisles × 8 bins, one
   mezzanine with a lift for the trolley, 20 test SKUs from a made-up web shop (cosmetics, coffee, a
   T-shirt in a polybag), and a *Hotell / Lager* switch.
3. **Guides on screen in the worker's language:** static Polish, Ukrainian and English strings for the
   four guides, picked from the detected language.
4. **Ask Holio** the two open questions in `docs/PLAN.md`: do three pains in one product count for or
   against us, and can we borrow a TC27 and a test catalogue for a week?

Sourced figure for the Holio slide: in warehouse picking, "travel time can account for 50 % or more of
total order picking time" (Supply Chain Digest, Cliff Holste, 12 Mar 2014; link in `docs/DEMO.md`
§ 1). Nothing else on this page is a measurement.
