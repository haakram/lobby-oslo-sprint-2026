import gsap from "gsap";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { floorsOf, type HotelMap, type HotelNode, roomsOf } from "@/features/hotel/mapFromRun";
import {
  itemName,
  placeName,
  ROOM_STATUS_LABEL,
  type RoomStatus,
  robotPoseAt,
  roomNumber,
  type Snapshot,
  type Timeline,
} from "@/features/replay";
import { roomPaint } from "@/ui/roomStatus";
import { HELD_WORD, heldOf } from "./held";
import { type SceneTokens, STATUS_TOKEN, tokenKey } from "./tokens";

/**
 * The hotel in three.js: floors stacked (or spread apart), rooms as tiles in their status colour,
 * one robot in the accent colour that walks its recorded path, and a map you can move through:
 * orbit, pan and zoom with mouse, touch or keys; click a room or a place. Imperative on purpose: one
 * renderer, geometry built once, nothing allocated per frame. `Hotel3D.tsx` owns it and calls
 * `dispose()` on unmount.
 */

export const FLOOR_HEIGHT = 8.5;
const EXPLODE_EXTRA = 12;
const ROOM_SIZE = 2.4;
const ROOM_HEIGHT = 0.5;
const TILE_HEIGHT = 0.3;
const SHAFT_HEIGHT = 1.6;
const CORRIDOR_WIDTH = 1.4;
const DOOR_WIDTH = 0.45;
const SLAB_MARGIN = 3.2;
const DIM_OPACITY = 0.1;
const FOLLOW_LERP = 0.08;
const FOCUS_OFFSET = new THREE.Vector3(12, 22, 15);
const START_OFFSET = new THREE.Vector3(22, 40, 27);
const CLICK_PX = 6;
const CLICK_MS = 600;
const KEY_ORBIT = 0.12;
const KEY_ZOOM = 0.12;

type FloorParts = {
  floor: number;
  group: THREE.Group;
  materials: THREE.Material[];
  labels: HTMLElement[];
};

type RoomSlot = {
  index: number;
  floor: number;
  colour: THREE.Color;
  status: RoomStatus;
  mesh: THREE.InstancedMesh;
  /** The room's number label, shown only when it matters (robot's room, chosen, one floor in view). */
  tag: HTMLElement;
  /** The quiet ink frame of an open avvik, drawn over the room's own status colour (never red). */
  avvikFrame: THREE.LineSegments;
  avvik: boolean;
  /** Held back by the room check (held.ts): painted as taken, and the hover says "Holdt tilbake". */
  held: boolean;
};
type Link = { line: THREE.Line; base: THREE.Vector3[] };
export type Pick = { kind: "room" | "place"; id: string; floor: number };

export type SceneOptions = {
  /** The night's hotel (`timeline.map`); the scene is built once per map. */
  map: HotelMap;
  tokens: SceneTokens;
  reducedMotion: boolean;
  compact: boolean;
  /** The person took the camera: following stops. */
  onUserOrbit?: () => void;
  /** A room was tapped (null: the floor between rooms). */
  onSelectRoom?: (roomId: string | null) => void;
  /** A place (lift, kitchen, dock …) was tapped; the camera has already flown there. */
  onSelectPlace?: (nodeId: string) => void;
};

function floorY(floor: number): number {
  return (floor - 1) * FLOOR_HEIGHT;
}

function label(text: string, className: string): CSS2DObject {
  const element = document.createElement("div");
  element.className = className;
  element.textContent = text;
  const object = new CSS2DObject(element);
  object.center.set(0.5, 1);
  return object;
}

export class HotelScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly labelRenderer: CSS2DRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly baseFov: number;
  private readonly controls: OrbitControls;
  private readonly ctx: gsap.Context;
  private readonly tokens: SceneTokens;
  private readonly reduced: boolean;
  private readonly options: SceneOptions;
  private readonly map: HotelMap;
  private readonly floorIds: number[];
  private readonly positions = new Map<string, THREE.Vector3>();
  private readonly floors: FloorParts[] = [];
  private readonly rooms = new Map<string, RoomSlot>();
  private readonly pickables: THREE.Object3D[] = [];
  private readonly links: Link[] = [];
  private readonly robot = new THREE.Group();
  private readonly cart: THREE.Mesh;
  private readonly robotLabel: HTMLElement;
  private readonly robotTask: HTMLElement;
  private readonly robotCarry: HTMLElement;
  private readonly hover: HTMLElement;
  private readonly attention: THREE.Mesh;
  private readonly selection: THREE.LineSegments;
  private attentionTween: gsap.core.Tween | null = null;
  private attentionRoom: string | null = null;
  private selectedRoom: string | null = null;
  private numbersFloor: number | null = null;
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly resizeObserver: ResizeObserver;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly spherical = new THREE.Spherical();
  private readonly pose = { from: "", to: "", progress: 1, node: "", floor: 1, moving: false };
  private readonly robotPos = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly spread = { value: 0 };
  private readonly hoverEnabled: boolean;
  private pointerPx = { x: 0, y: 0 };
  private pointerDirty = false;
  private pointerInside = false;
  private down: { x: number; y: number; t: number } | null = null;
  private timeline: Timeline | null = null;
  private now: () => number = () => 0;
  private focusFloor: number | null = null;
  private follow = true;
  private active = true;
  private frame = 0;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly labelLayer: HTMLElement,
    options: SceneOptions,
  ) {
    this.options = options;
    this.map = options.map;
    this.floorIds = floorsOf(options.map);
    this.tokens = options.tokens;
    this.reduced = options.reducedMotion;
    this.hoverEnabled = typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;
    const { tokens } = this;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(new THREE.Color(tokens.bg), 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.style.display = "block";
    canvas.style.touchAction = "none";
    canvas.style.cursor = "grab";
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "application");
    canvas.setAttribute(
      "aria-label",
      "Hotellkart. Dra for å snu, rull for å zoome. Piltaster flytter, Shift og piltaster snur, pluss og minus zoomer. Klikk et rom, eller velg det i listen Velg rom, for detaljer.",
    );
    container.appendChild(canvas);

    this.labelRenderer = new CSS2DRenderer({ element: labelLayer });

    this.hover = document.createElement("div");
    this.hover.className = "h3d-hover";
    this.hover.hidden = true;
    labelLayer.appendChild(this.hover);

    this.scene.fog = new THREE.Fog(new THREE.Color(tokens.bg), 70, 180);

    const centre = new THREE.Vector3(8, floorY(2), 7);
    this.baseFov = options.compact ? 34 : 38;
    this.camera = new THREE.PerspectiveCamera(this.baseFov, 1, 0.5, 400);
    this.camera.position.copy(centre).add(START_OFFSET);
    this.camera.lookAt(centre);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.copy(centre);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 140;
    this.controls.maxPolarAngle = 1.38;
    this.controls.keyPanSpeed = 16;
    this.controls.listenToKeyEvents(canvas);
    this.controls.addEventListener("start", this.onUserTakesCamera);

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("keydown", this.onKeyDown, true);

    // Soft light only (DESIGN.md): a sky/ground pair and one key light, no shadow maps.
    const hemi = new THREE.HemisphereLight(new THREE.Color(tokens.text), new THREE.Color(tokens.sunken), 2.4);
    const key = new THREE.DirectionalLight(new THREE.Color(tokens.text), 2.2);
    key.position.set(24, 48, 16);
    const fill = new THREE.DirectionalLight(new THREE.Color(tokens.text), 0.8);
    fill.position.set(-30, 20, -10);
    this.scene.add(hemi, key, fill);

    for (const node of Object.values(this.map.nodes)) {
      this.positions.set(node.id, new THREE.Vector3(node.x, floorY(node.floor), node.z));
    }

    this.ctx = gsap.context(() => {});
    this.buildFloors();

    const robotMaterial = this.track(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(tokens.accent),
        emissive: new THREE.Color(tokens.accent),
        emissiveIntensity: 0.28,
        roughness: 0.55,
        metalness: 0,
      }),
    );
    const body = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.55, 0.68, 0.9, 24)), robotMaterial);
    body.position.y = 0.45;
    const head = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.42, 24, 16)), robotMaterial);
    head.position.y = 1.24;
    const visor = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(0.5, 0.14, 0.2)),
      this.track(new THREE.MeshStandardMaterial({ color: new THREE.Color(tokens.bg), roughness: 0.4 })),
    );
    visor.position.set(0, 1.3, 0.36);
    const ring = new THREE.Mesh(
      this.track(new THREE.RingGeometry(0.85, 1.05, 40)),
      this.track(
        new THREE.MeshBasicMaterial({ color: new THREE.Color(tokens.accent), transparent: true, opacity: 0.7, depthWrite: false }),
      ),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    this.cart = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(0.9, 0.7, 0.7)),
      this.track(new THREE.MeshStandardMaterial({ color: new THREE.Color(tokens.lineStrong), roughness: 0.8 })),
    );
    this.cart.position.set(0, 0.35, -1.05);
    this.cart.visible = false;
    const glow = new THREE.PointLight(new THREE.Color(tokens.accent), 14, 11, 2);
    glow.position.y = 1.6;
    this.robot.add(body, head, visor, ring, this.cart, glow);

    this.robotLabel = document.createElement("div");
    this.robotLabel.className = "h3d-robot";
    this.robotTask = document.createElement("div");
    this.robotTask.className = "h3d-robot-task";
    this.robotCarry = document.createElement("div");
    this.robotCarry.className = "h3d-robot-carry";
    this.robotLabel.append(this.robotTask, this.robotCarry);
    const robotTag = new CSS2DObject(this.robotLabel);
    // Beside the robot, not on it (jury round 1: the tooltip hid the robot): its left edge at the
    // robot's middle, pushed right in CSS (.h3d-robot margin).
    robotTag.center.set(0, 0.5);
    robotTag.position.y = 0.9;
    this.robot.add(robotTag);
    this.scene.add(this.robot);

    this.attention = new THREE.Mesh(
      this.track(new THREE.RingGeometry(1.75, 1.95, 48)),
      this.track(
        new THREE.MeshBasicMaterial({ color: new THREE.Color(tokens.accent), transparent: true, opacity: 0.85, depthWrite: false }),
      ),
    );
    this.attention.rotation.x = -Math.PI / 2;
    this.attention.visible = false;
    this.scene.add(this.attention);

    this.selection = new THREE.LineSegments(
      this.track(new THREE.EdgesGeometry(this.track(new THREE.BoxGeometry(ROOM_SIZE + 0.6, ROOM_HEIGHT + 0.4, ROOM_SIZE + 0.6)))),
      this.track(new THREE.LineBasicMaterial({ color: new THREE.Color(tokens.text), transparent: true, opacity: 0.95 })),
    );
    this.selection.visible = false;
    this.scene.add(this.selection);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.frame = requestAnimationFrame(this.tick);
  }

  private track<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  private buildFloors() {
    const { tokens } = this;
    const allNodes = this.map.nodes;
    const allEdges = this.map.edges;
    const allRooms = roomsOf(this.map);
    const nodesByFloor = new Map<number, HotelNode[]>();
    for (const node of Object.values(allNodes)) {
      const list = nodesByFloor.get(node.floor) ?? [];
      list.push(node);
      nodesByFloor.set(node.floor, list);
    }

    const roomGeometry = this.track(new THREE.BoxGeometry(ROOM_SIZE, ROOM_HEIGHT, ROOM_SIZE));
    const avvikEdges = this.track(new THREE.EdgesGeometry(this.track(new THREE.BoxGeometry(ROOM_SIZE + 0.25, ROOM_HEIGHT + 0.12, ROOM_SIZE + 0.25))));
    const tileGeometry = this.track(new THREE.BoxGeometry(2.8, TILE_HEIGHT, 2.8));
    const shaftGeometry = this.track(new THREE.BoxGeometry(2.2, SHAFT_HEIGHT, 2.2));
    const unit = this.track(new THREE.BoxGeometry(1, 1, 1));
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    for (const floor of this.floorIds) {
      const nodes = nodesByFloor.get(floor) ?? [];
      const group = new THREE.Group();
      const materials: THREE.Material[] = [];
      const labels: HTMLElement[] = [];
      const y = floorY(floor);

      const xs = nodes.map((node) => node.x);
      const zs = nodes.map((node) => node.z);
      const minX = Math.min(...xs) - SLAB_MARGIN;
      const maxX = Math.max(...xs) + SLAB_MARGIN;
      const minZ = Math.min(...zs) - SLAB_MARGIN;
      const maxZ = Math.max(...zs) + SLAB_MARGIN;

      const slabMaterial = this.track(
        new THREE.MeshStandardMaterial({ color: new THREE.Color(tokens.sunken), roughness: 0.95, transparent: true, opacity: 0.96 }),
      );
      const slab = new THREE.Mesh(this.track(new THREE.BoxGeometry(maxX - minX, 0.24, maxZ - minZ)), slabMaterial);
      slab.position.set((minX + maxX) / 2, y - 0.12, (minZ + maxZ) / 2);
      slab.userData.floor = floor;
      group.add(slab);
      materials.push(slabMaterial);
      this.pickables.push(slab);

      const edgeMaterial = this.track(
        new THREE.LineBasicMaterial({ color: new THREE.Color(tokens.lineStrong), transparent: true, opacity: 0.7 }),
      );
      const outline = new THREE.LineSegments(this.track(new THREE.EdgesGeometry(slab.geometry)), edgeMaterial);
      outline.position.copy(slab.position);
      group.add(outline);
      materials.push(edgeMaterial);

      // Walkways: every edge between two non-room places on this floor, plus door stubs to rooms.
      const walkMaterial = this.track(
        new THREE.MeshStandardMaterial({ color: new THREE.Color(tokens.lineStrong), roughness: 0.9, transparent: true, opacity: 0.6 }),
      );
      const doorMaterial = this.track(
        new THREE.MeshStandardMaterial({ color: new THREE.Color(tokens.lineStrong), roughness: 0.9, transparent: true, opacity: 0.35 }),
      );
      const floorEdges = allEdges.filter((edge) => {
        const a = allNodes[edge.a];
        const b = allNodes[edge.b];
        return a && b && a.floor === floor && b.floor === floor;
      });
      const walkways = floorEdges.filter((edge) => allNodes[edge.a].kind !== "room" && allNodes[edge.b].kind !== "room");
      const doors = floorEdges.filter((edge) => allNodes[edge.a].kind === "room" || allNodes[edge.b].kind === "room");
      const walkMesh = new THREE.InstancedMesh(unit, walkMaterial, walkways.length);
      const doorMesh = new THREE.InstancedMesh(unit, doorMaterial, doors.length);
      const place = (mesh: THREE.InstancedMesh, list: typeof floorEdges, width: number, height: number, lift: number) => {
        list.forEach((edge, index) => {
          const a = this.positions.get(edge.a)!;
          const b = this.positions.get(edge.b)!;
          const length = a.distanceTo(b) + width;
          position.addVectors(a, b).multiplyScalar(0.5).setY(y + lift);
          quaternion.setFromAxisAngle(up, Math.atan2(b.x - a.x, b.z - a.z));
          scale.set(width, height, length);
          matrix.compose(position, quaternion, scale);
          mesh.setMatrixAt(index, matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
      };
      place(walkMesh, walkways, CORRIDOR_WIDTH, 0.1, 0.05);
      place(doorMesh, doors, DOOR_WIDTH, 0.06, 0.03);
      group.add(walkMesh, doorMesh);
      materials.push(walkMaterial, doorMaterial);
      this.disposables.push(walkMesh, doorMesh);

      // Rooms: one instanced mesh per floor so a floor can fade on its own.
      const rooms = allRooms.filter((room) => room.floor === floor);
      const roomMaterial = this.track(
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, transparent: true, opacity: 1 }),
      );
      const roomMesh = new THREE.InstancedMesh(roomGeometry, roomMaterial, rooms.length);
      const avvikMaterial = this.track(
        new THREE.LineBasicMaterial({ color: new THREE.Color(tokens.text), transparent: true, opacity: 0.95 }),
      );
      materials.push(avvikMaterial);
      roomMesh.userData.floor = floor;
      roomMesh.userData.rooms = rooms.map((room) => room.id);
      rooms.forEach((room, index) => {
        matrix.makeTranslation(room.x, y + ROOM_HEIGHT / 2, room.z);
        roomMesh.setMatrixAt(index, matrix);
        const colour = new THREE.Color(tokens[STATUS_TOKEN.ukjent]);
        roomMesh.setColorAt(index, colour);
        const tag = label(roomNumber(room.id), "h3d-room");
        tag.position.set(room.x, y + ROOM_HEIGHT + 0.05, room.z);
        // Room numbers are quiet until they matter: 36 of them over stacked floors collide (jury round 1).
        tag.element.toggleAttribute("data-hidden", true);
        group.add(tag);
        labels.push(tag.element);
        const avvikFrame = new THREE.LineSegments(avvikEdges, avvikMaterial);
        avvikFrame.position.set(room.x, y + ROOM_HEIGHT / 2, room.z);
        avvikFrame.visible = false;
        group.add(avvikFrame);
        this.rooms.set(room.id, { index, floor, colour, status: "ukjent", mesh: roomMesh, tag: tag.element, avvikFrame, avvik: false, held: false });
      });
      roomMesh.instanceMatrix.needsUpdate = true;
      if (roomMesh.instanceColor) roomMesh.instanceColor.needsUpdate = true;
      group.add(roomMesh);
      materials.push(roomMaterial);
      this.disposables.push(roomMesh);
      this.pickables.push(roomMesh);

      // One outline per room, merged into a single line object per floor, so unknown rooms still read.
      const roomEdges = this.track(new THREE.EdgesGeometry(roomGeometry));
      const edgeCount = roomEdges.attributes.position.count;
      const outlinePositions = new Float32Array(edgeCount * 3 * rooms.length);
      rooms.forEach((room, index) => {
        const source = roomEdges.attributes.position.array as Float32Array;
        const offset = index * edgeCount * 3;
        for (let i = 0; i < edgeCount; i += 1) {
          outlinePositions[offset + i * 3] = source[i * 3] + room.x;
          outlinePositions[offset + i * 3 + 1] = source[i * 3 + 1] + y + ROOM_HEIGHT / 2;
          outlinePositions[offset + i * 3 + 2] = source[i * 3 + 2] + room.z;
        }
      });
      const outlineGeometry = this.track(new THREE.BufferGeometry());
      outlineGeometry.setAttribute("position", new THREE.BufferAttribute(outlinePositions, 3));
      const outlineMaterial = this.track(
        new THREE.LineBasicMaterial({ color: new THREE.Color(tokens.lineStrong), transparent: true, opacity: 0.55 }),
      );
      group.add(new THREE.LineSegments(outlineGeometry, outlineMaterial));
      materials.push(outlineMaterial);

      // Hubs, service rooms, lifts and stairs: tiles with a name.
      const tileMaterial = this.track(
        new THREE.MeshStandardMaterial({ color: new THREE.Color(tokens.sunken), roughness: 0.9, transparent: true, opacity: 1 }),
      );
      const shaftMaterial = this.track(
        new THREE.MeshStandardMaterial({ color: new THREE.Color(tokens.lineStrong), roughness: 0.7, transparent: true, opacity: 0.85 }),
      );
      const shaftEdges = this.track(new THREE.EdgesGeometry(shaftGeometry));
      const shaftLineMaterial = this.track(
        new THREE.LineBasicMaterial({ color: new THREE.Color(tokens.lineStrong), transparent: true, opacity: 0.8 }),
      );
      for (const node of nodes) {
        if (node.kind === "room" || node.kind === "corridor") continue;
        const vertical = node.kind === "elevator" || node.kind === "stairwell";
        // Every place is a low tile the robot can stand on; a lift or stairwell adds an open wire frame.
        const mesh = new THREE.Mesh(tileGeometry, vertical ? shaftMaterial : tileMaterial);
        mesh.position.set(node.x, y + TILE_HEIGHT / 2, node.z);
        mesh.userData.node = node.id;
        mesh.userData.floor = floor;
        group.add(mesh);
        this.pickables.push(mesh);
        if (vertical) {
          const frame = new THREE.LineSegments(shaftEdges, shaftLineMaterial);
          frame.position.set(node.x, y + SHAFT_HEIGHT / 2, node.z);
          group.add(frame);
        }
        const tag = label(placeName(node.id), vertical ? "h3d-place h3d-place-shaft" : "h3d-place");
        tag.position.set(node.x, y + (vertical ? SHAFT_HEIGHT : TILE_HEIGHT) + 0.05, node.z);
        group.add(tag);
        labels.push(tag.element);
      }
      materials.push(tileMaterial, shaftMaterial, shaftLineMaterial);

      const floorTag = label(`${floor}. etasje`, "h3d-floor");
      floorTag.center.set(1, 0.5);
      floorTag.position.set(minX - 0.6, y + 0.4, maxZ - 2);
      group.add(floorTag);
      labels.push(floorTag.element);

      this.scene.add(group);
      this.floors.push({ floor, group, materials, labels });
    }

    // The lift and the stairs between floors, as a line through their landings.
    const linkMaterial = this.track(
      new THREE.LineBasicMaterial({ color: new THREE.Color(tokens.lineStrong), transparent: true, opacity: 0.55 }),
    );
    for (const prefix of ["elevator-", "stairwell-"]) {
      const base = this.floorIds.map((floor) => this.positions.get(`${prefix}${floor}`))
        .filter((point): point is THREE.Vector3 => !!point)
        .map((point) => point.clone().setY(point.y + SHAFT_HEIGHT));
      if (base.length < 2) continue;
      const geometry = this.track(new THREE.BufferGeometry().setFromPoints(base));
      const line = new THREE.Line(geometry, linkMaterial);
      this.scene.add(line);
      this.links.push({ line, base });
    }
  }

  /** Extra height a point at base height `y` gets when the floors are spread apart. */
  private lift(y: number, spread = this.spread.value): number {
    return (y / FLOOR_HEIGHT) * EXPLODE_EXTRA * spread;
  }

  private applySpread = () => {
    for (const parts of this.floors) parts.group.position.y = this.lift(floorY(parts.floor));
    for (const { line, base } of this.links) {
      const attribute = line.geometry.attributes.position as THREE.BufferAttribute;
      base.forEach((point, index) => attribute.setXYZ(index, point.x, point.y + this.lift(floorY(this.floorIds[index] ?? 1)), point.z));
      attribute.needsUpdate = true;
    }
    this.placeMarkers();
  };

  /** Frames the whole building (as stacked, or as it will be once spread) and stops following. */
  fitAll(exploded: boolean) {
    this.onUserTakesCamera();
    const spread = exploded ? 1 : 0;
    const box = new THREE.Box3();
    for (const point of this.positions.values()) {
      box.expandByPoint(this.tmp.set(point.x, point.y + this.lift(point.y, spread), point.z));
      box.expandByPoint(this.tmp.set(point.x, point.y + this.lift(point.y, spread) + SHAFT_HEIGHT, point.z));
    }
    box.expandByScalar(SLAB_MARGIN);
    const centre = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    const vertical = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * this.camera.aspect);
    const distance = (radius / Math.sin(Math.min(vertical, horizontal) / 2)) * 1.02;
    const offset = START_OFFSET.clone().normalize().multiplyScalar(Math.min(this.controls.maxDistance, distance));
    this.flyTo(centre, offset);
  }

  /**
   * Which floor shows every room number (null: none). The robot's room and the chosen room always
   * show theirs; the rest stay quiet, so labels never pile up over stacked or spread floors.
   */
  setRoomNumbers(floor: number | null) {
    this.numbersFloor = floor;
    this.refreshRoomTags();
  }

  private refreshRoomTags() {
    for (const [id, slot] of this.rooms) {
      const show = id === this.attentionRoom || id === this.selectedRoom || (this.numbersFloor !== null && slot.floor === this.numbersFloor);
      slot.tag.toggleAttribute("data-hidden", !show);
    }
  }

  /** Shows room and place names on one floor only (null: every floor), so stacked floors don't mix. */
  setLabelFloor(floor: number | null) {
    for (const parts of this.floors) {
      const quiet = floor !== null && parts.floor !== floor;
      for (const element of parts.labels) {
        // Room numbers have their own rule (setRoomNumbers); floor names always show.
        if (element.classList.contains("h3d-floor") || element.classList.contains("h3d-room")) continue;
        element.toggleAttribute("data-quiet", quiet);
      }
    }
  }

  private placeMarkers() {
    if (this.attentionRoom) {
      const at = this.positions.get(this.attentionRoom);
      if (at) this.attention.position.set(at.x, at.y + this.lift(at.y) + ROOM_HEIGHT + 0.08, at.z);
    }
    if (this.selectedRoom) {
      const at = this.positions.get(this.selectedRoom);
      if (at) this.selection.position.set(at.x, at.y + this.lift(at.y) + ROOM_HEIGHT / 2, at.z);
    }
  }

  setTimeline(timeline: Timeline | null) {
    this.timeline = timeline;
  }

  setClock(now: () => number) {
    this.now = now;
  }

  setActive(active: boolean) {
    if (this.active === active || this.disposed) return;
    this.active = active;
    if (active) this.frame = requestAnimationFrame(this.tick);
    else cancelAnimationFrame(this.frame);
  }

  setFollow(follow: boolean) {
    this.follow = follow;
  }

  /** Spreads the floors apart (true) or stacks them (false). `fitAll` frames the result. */
  setExploded(exploded: boolean) {
    const value = exploded ? 1 : 0;
    if (this.spread.value === value) return;
    this.ctx.add(() => {
      gsap.killTweensOf(this.spread);
      if (this.reduced) {
        this.spread.value = value;
        this.applySpread();
      } else {
        gsap.to(this.spread, { value, duration: 0.6, ease: "power2.inOut", onUpdate: this.applySpread });
      }
    });
  }

  /** Fades every floor but `floor`; null shows them all. */
  setFocusFloor(floor: number | null) {
    if (this.focusFloor === floor) return;
    this.focusFloor = floor;
    this.ctx.add(() => {
      for (const parts of this.floors) {
        const dim = floor !== null && parts.floor !== floor;
        for (const material of parts.materials) {
          // Each material remembers the opacity it was built with, so a floor fades back to it.
          if (material.userData.opacity === undefined) material.userData.opacity = material.opacity;
          const full = material.userData.opacity as number;
          const end = dim ? Math.min(DIM_OPACITY, full) : full;
          if (this.reduced) material.opacity = end;
          else gsap.to(material, { opacity: end, duration: 0.3, ease: "power2.out", overwrite: true });
        }
        for (const element of parts.labels) element.toggleAttribute("data-dim", dim);
      }
    });
  }

  /** Flies the camera to the robot and follows it again. */
  focusRobot() {
    this.follow = true;
    this.flyTo(this.robotPos);
  }

  /** Flies the camera to a place on the map (a lift, the kitchen, the dock …). Following stops. */
  focusNode(nodeId: string) {
    const at = this.positions.get(nodeId);
    if (!at) return;
    this.follow = false;
    this.tmp.set(at.x, at.y + this.lift(at.y), at.z);
    this.flyTo(this.tmp);
  }

  private flyTo(point: THREE.Vector3, offset: THREE.Vector3 = FOCUS_OFFSET) {
    const target = point.clone();
    const position = target.clone().add(offset);
    if (this.reduced) {
      this.controls.target.copy(target);
      this.camera.position.copy(position);
      return;
    }
    this.ctx.add(() => {
      gsap.to(this.controls.target, { x: target.x, y: target.y, z: target.z, duration: 0.7, ease: "power3.inOut", overwrite: true });
      gsap.to(this.camera.position, { x: position.x, y: position.y, z: position.z, duration: 0.7, ease: "power3.inOut", overwrite: true });
    });
  }

  /** Outlines the chosen room; null clears it. */
  setSelectedRoom(roomId: string | null) {
    if (roomId === this.selectedRoom) return;
    this.selectedRoom = roomId && this.positions.has(roomId) ? roomId : null;
    this.selection.visible = this.selectedRoom !== null;
    this.refreshRoomTags();
    if (this.selectedRoom) {
      this.placeMarkers();
      if (!this.reduced) {
        this.ctx.add(() => {
          gsap.fromTo(this.selection.scale, { x: 1.25, y: 1.25, z: 1.25 }, { x: 1, y: 1, z: 1, duration: 0.25, ease: "power2.out", overwrite: true });
        });
      }
    }
  }

  /** Room colours, the robot's label and the highlighted room. Called at HUD rate, not per frame. */
  setSnapshot(snapshot: Snapshot | null) {
    const { tokens } = this;
    for (const [id, slot] of this.rooms) {
      const view = snapshot?.rooms[id];
      const status = view?.status ?? "ukjent";
      const avvik = view?.avvik ?? false;
      slot.held = heldOf(view) !== null;
      if (avvik !== slot.avvik) {
        slot.avvik = avvik;
        slot.avvikFrame.visible = avvik;
      }
      if (status === slot.status) continue;
      slot.status = status;
      // One look per state across the app (src/ui/roomStatus.ts): avvik is the ink frame, not a colour.
      const target = new THREE.Color(tokens[tokenKey(roomPaint(status).fill)]);
      const paint = () => {
        slot.mesh.setColorAt(slot.index, slot.colour);
        if (slot.mesh.instanceColor) slot.mesh.instanceColor.needsUpdate = true;
      };
      if (this.reduced) {
        slot.colour.copy(target);
        paint();
      } else {
        this.ctx.add(() => {
          gsap.to(slot.colour, { r: target.r, g: target.g, b: target.b, duration: 0.4, ease: "power2.out", overwrite: true, onUpdate: paint });
        });
      }
    }

    const task = snapshot?.robot.task ?? null;
    const node = snapshot?.robot.node ?? null;
    const idle = node === "charging-dock" ? "Lader" : "Ledig";
    this.robotTask.textContent = task ? task.title : snapshot ? idle : "";
    const carrying = snapshot?.robot.carrying ?? [];
    this.robotCarry.textContent = carrying.length ? `Har med: ${summariseItems(carrying)}` : "";
    this.robotCarry.hidden = carrying.length === 0;
    this.cart.visible = snapshot?.robot.cart ?? false;

    const room = snapshot?.robot.attention ?? null;
    if (room !== this.attentionRoom) {
      this.attentionRoom = room;
      this.refreshRoomTags();
      const at = room ? this.positions.get(room) : undefined;
      this.attentionTween?.kill();
      this.attentionTween = null;
      if (at) {
        this.placeMarkers();
        this.attention.scale.setScalar(1);
        this.attention.visible = true;
        const material = this.attention.material as THREE.MeshBasicMaterial;
        material.opacity = 0.85;
        if (!this.reduced) {
          this.ctx.add(() => {
            this.attentionTween = gsap.to(this.attention.scale, {
              x: 1.14,
              z: 1.14,
              duration: 1.1,
              ease: "sine.inOut",
              yoyo: true,
              repeat: -1,
            });
          });
        }
      } else {
        this.attention.visible = false;
      }
    }
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    // setSize also sets the canvas's CSS size, so a 2× screen draws at 2× and still fits the box.
    this.renderer.setSize(width, height);
    this.labelRenderer.setSize(width, height);
    this.camera.aspect = width / height;
    // A portrait canvas (phone) sees less sideways, so it opens the lens a little.
    this.camera.fov = this.camera.aspect < 1 ? this.baseFov + 10 : this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  // Picking ---------------------------------------------------------------------------------------

  private readonly onUserTakesCamera = () => {
    if (this.follow) {
      this.follow = false;
      this.options.onUserOrbit?.();
    }
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    this.down = { x: event.clientX, y: event.clientY, t: performance.now() };
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    const down = this.down;
    this.down = null;
    if (!down) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    if (moved > CLICK_PX || performance.now() - down.t > CLICK_MS) return;
    const hit = this.pick(event.clientX, event.clientY);
    if (hit?.kind === "room") {
      this.options.onSelectRoom?.(hit.id);
    } else if (hit?.kind === "place") {
      this.focusNode(hit.id);
      this.options.onUserOrbit?.();
      this.options.onSelectPlace?.(hit.id);
    } else {
      this.options.onSelectRoom?.(null);
    }
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.hoverEnabled || event.pointerType !== "mouse") return;
    const rect = this.container.getBoundingClientRect();
    this.pointerPx = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.pointerInside = true;
    this.pointerDirty = true;
  };

  private readonly onPointerLeave = () => {
    this.pointerInside = false;
    this.hover.hidden = true;
    this.renderer.domElement.style.cursor = "grab";
  };

  /** Shift + arrows orbit, plus/minus zoom; plain arrows pan through OrbitControls. */
  private readonly onKeyDown = (event: KeyboardEvent) => {
    const { key } = event;
    const arrow = key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown";
    if (arrow && !event.shiftKey) return;
    if (!arrow && key !== "+" && key !== "=" && key !== "-" && key !== "_") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.onUserTakesCamera();
    this.tmp.subVectors(this.camera.position, this.controls.target);
    this.spherical.setFromVector3(this.tmp);
    if (key === "ArrowLeft") this.spherical.theta += KEY_ORBIT;
    if (key === "ArrowRight") this.spherical.theta -= KEY_ORBIT;
    if (key === "ArrowUp") this.spherical.phi = Math.max(0.15, this.spherical.phi - KEY_ORBIT);
    if (key === "ArrowDown") this.spherical.phi = Math.min(this.controls.maxPolarAngle, this.spherical.phi + KEY_ORBIT);
    if (key === "+" || key === "=") this.spherical.radius = Math.max(this.controls.minDistance, this.spherical.radius * (1 - KEY_ZOOM));
    if (key === "-" || key === "_") this.spherical.radius = Math.min(this.controls.maxDistance, this.spherical.radius * (1 + KEY_ZOOM));
    this.tmp.setFromSpherical(this.spherical);
    this.camera.position.copy(this.controls.target).add(this.tmp);
  };

  private pick(clientX: number, clientY: number): Pick | null {
    const rect = this.container.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    return this.pickAt(this.pointer);
  }

  private pickAt(ndc: THREE.Vector2): Pick | null {
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    for (const hit of hits) {
      const floor = hit.object.userData.floor as number | undefined;
      // A faded floor is not what the person is looking at.
      if (this.focusFloor !== null && floor !== undefined && floor !== this.focusFloor) continue;
      const rooms = hit.object.userData.rooms as string[] | undefined;
      if (rooms && hit.instanceId !== undefined) return { kind: "room", id: rooms[hit.instanceId], floor: floor ?? 1 };
      const node = hit.object.userData.node as string | undefined;
      if (node) return { kind: "place", id: node, floor: floor ?? 1 };
      return null; // the slab: between rooms
    }
    return null;
  }

  private updateHover() {
    this.pointerDirty = false;
    if (!this.pointerInside) return;
    const rect = this.container.getBoundingClientRect();
    this.pointer.set((this.pointerPx.x / rect.width) * 2 - 1, -(this.pointerPx.y / rect.height) * 2 + 1);
    const hit = this.pickAt(this.pointer);
    if (!hit) {
      this.hover.hidden = true;
      this.renderer.domElement.style.cursor = this.down ? "grabbing" : "grab";
      return;
    }
    const slot = hit.kind === "room" ? this.rooms.get(hit.id) : undefined;
    const text = hit.kind === "room" ? `${placeName(hit.id)} · ${slot?.held ? HELD_WORD : ROOM_STATUS_LABEL[slot?.status ?? "ukjent"]}` : placeName(hit.id);
    if (this.hover.textContent !== text) this.hover.textContent = text;
    this.hover.style.transform = `translate(${Math.round(this.pointerPx.x + 14)}px, ${Math.round(this.pointerPx.y + 16)}px)`;
    this.hover.hidden = false;
    this.renderer.domElement.style.cursor = "pointer";
  }

  // Frame -----------------------------------------------------------------------------------------

  private readonly tick = () => {
    if (this.disposed || !this.active) return;
    this.frame = requestAnimationFrame(this.tick);

    if (this.timeline) {
      robotPoseAt(this.timeline, this.now(), this.pose);
      const from = this.positions.get(this.pose.from);
      const to = this.positions.get(this.pose.to);
      if (from && to) {
        if (this.reduced || !this.pose.moving) this.robotPos.copy(to);
        else this.robotPos.lerpVectors(from, to, this.pose.progress);
        if (this.pose.moving) {
          this.tmp.subVectors(to, from);
          if (this.tmp.x !== 0 || this.tmp.z !== 0) this.robot.rotation.y = Math.atan2(this.tmp.x, this.tmp.z);
        }
        this.robotPos.y += this.lift(this.robotPos.y);
        this.robot.position.copy(this.robotPos);
      }
    }

    if (this.follow) {
      this.tmp.copy(this.robotPos).setY(this.robotPos.y + 0.8);
      this.tmpB.subVectors(this.tmp, this.controls.target);
      if (this.tmpB.lengthSq() > 0.0004) {
        this.tmpB.multiplyScalar(this.reduced ? 1 : FOLLOW_LERP);
        this.controls.target.add(this.tmpB);
        this.camera.position.add(this.tmpB);
      }
    }

    this.controls.update();
    if (this.pointerDirty) this.updateHover();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerleave", this.onPointerLeave);
    canvas.removeEventListener("keydown", this.onKeyDown, true);
    this.attentionTween?.kill();
    this.ctx.revert();
    this.controls.stopListenToKeyEvents();
    this.controls.dispose();
    for (const item of this.disposables) item.dispose();
    this.scene.traverse((object) => {
      if (object instanceof CSS2DObject) object.element.remove();
    });
    this.scene.clear();
    this.renderer.dispose();
    canvas.remove();
    this.labelLayer.replaceChildren();
  }
}

/** "2 × vannflaske, pute" from the item list. */
function summariseItems(items: string[]): string {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()].map(([item, count]) => (count > 1 ? `${count} × ${itemName(item)}` : itemName(item))).join(", ");
}
