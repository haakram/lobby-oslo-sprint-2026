# Models and runtime for Øyne

Served from `public/` so the live boxes never depend on the venue's wifi reaching a CDN.

## `efficientdet_lite0.tflite`

- What: MediaPipe object detector, EfficientDet-Lite0, float16 (COCO classes).
- Source: https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite
- Downloaded: 2026-11-07
- Size: 7 254 339 bytes
- SHA-256: `4b59100025bea1235a84c1038879a6cccc9f6c49f5e41144e91e74d99e780993`

## `../mediapipe/` (WASM runtime)

- What: `vision_wasm_internal.js` and `vision_wasm_internal.wasm`, copied unchanged from the installed
  package's `wasm/` folder. `FilesetResolver.forVisionTasks("/mediapipe")` loads exactly this pair.
- Package: `@mediapipe/tasks-vision@1.2.2` (pinned in `package.json`)
- SHA-256:
  - `vision_wasm_internal.js`: `f2b9c17131ea79716ec6bf07b117a087b2749a6f8a1e2f1f2e77a9382092db5b`
  - `vision_wasm_internal.wasm`: `f5bd25147ac89d506074293ce2675969b10e827180db95a0d9689c2ed80764ab`
- When the package version changes, copy the pair again:
  `cp node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.{js,wasm} public/mediapipe/`
- ESLint skips `public/mediapipe/**`: it is the package's own build output, not our code.
