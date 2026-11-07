import gsap from "gsap";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import {
  HOTEL_EDGES,
  HOTEL_FLOORS,
  HOTEL_NODES,
  HOTEL_ROOMS,
  type HotelNode,
  itemName,
  placeName,
  type RoomStatus,
  robotPoseAt,
  roomNumber,
  type Snapshot,
  type Timeline,
} from "@/features/replay";
import { type SceneTokens, STATUS_TOKEN } from "./tokens";

/**
 * The hotel in three.js: floors stacked, rooms as tiles in their status colour, one robot in the
 * accent colour that walks its recorded path. Imperative on purpose: one renderer, geometry built
 * once, nothing allocated per frame. `Hotel3D.tsx` owns it and calls `dispose()` on unmount.
 */

export const FLOOR_HEIGHT = 7;
const ROOM_SIZE = 2.4;
const ROOM_HEIGHT = 0.5;
const TILE_HEIGHT = 0.3;
const SHAFT_HEIGHT = 1.6;
const CORRIDOR_WIDTH = 1.4;
const DOOR_WIDTH = 0.45;
const SLAB_MARGIN = 3.2;
const DIM_OPACITY = 0.18;
const FOLLOW_LERP = 0.08;
const FOCUS_OFFSET = new THREE.Vector3(13, 15, 17);

type FloorParts = {
  floor: number;
  group: THREE.Group;
  materials: THREE.Material[];
  labels: HTMLElement[];
};

type RoomSlot = { index: number; floor: number; colour: THREE.Color; status: RoomStatus; mesh: THREE.InstancedMesh };

export type SceneOptions = {
  tokens: SceneTokens;
  reducedMotion: boolean;
  compact: boolean;
  onUserOrbit?: () => void;
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
  private readonly controls: OrbitControls;
  private readonly ctx: gsap.Context;
  private readonly tokens: SceneTokens;
  private readonly reduced: boolean;
  private readonly positions = new Map<string, THREE.Vector3>();
  private readonly floors: FloorParts[] = [];
  private readonly rooms = new Map<string, RoomSlot>();
  private readonly robot = new THREE.Group();
  private readonly cart: THREE.Mesh;
  private readonly robotLabel: HTMLElement;
  private readonly robotTask: HTMLElement;
  private readonly robotCarry: HTMLElement;
  private readonly attention: THREE.Mesh;
  private attentionTween: gsap.core.Tween | null = null;
  private attentionRoom: string | null = null;
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly resizeObserver: ResizeObserver;
  private readonly pose = { from: "", to: "", progress: 1, node: "", floor: 1, moving: false };
  private readonly robotPos = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
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
    this.tokens = options.tokens;
    this.reduced = options.reducedMotion;
    const { tokens } = this;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(new THREE.Color(tokens.bg), 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.display = "block";
    container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer({ element: labelLayer });

    this.scene.fog = new THREE.Fog(new THREE.Color(tokens.bg), 70, 160);

    const centre = new THREE.Vector3(8, floorY(2), 7);
    this.camera = new THREE.PerspectiveCamera(options.compact ? 34 : 38, 1, 0.5, 400);
    this.camera.position.copy(centre).add(new THREE.Vector3(30, 34, 36));
    this.camera.lookAt(centre);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(centre);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 120;
    this.controls.maxPolarAngle = 1.38;
    this.controls.addEventListener("start", () => {
      if (this.follow) {
        this.follow = false;
        options.onUserOrbit?.();
      }
    });

    const hemi = new THREE.HemisphereLight(new THREE.Color(tokens.text), new THREE.Color(tokens.bg), 1.1);
    const key = new THREE.DirectionalLight(new THREE.Color(tokens.text), 1.2);
    key.position.set(24, 48, 16);
    this.scene.add(hemi, key);

    for (const node of Object.values(HOTEL_NODES)) {
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
    robotTag.center.set(0.5, 1);
    robotTag.position.y = 2.1;
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
    const nodesByFloor = new Map<number, HotelNode[]>();
    for (const node of Object.values(HOTEL_NODES)) {
      const list = nodesByFloor.get(node.floor) ?? [];
      list.push(node);
      nodesByFloor.set(node.floor, list);
    }

    const roomGeometry = this.track(new THREE.BoxGeometry(ROOM_SIZE, ROOM_HEIGHT, ROOM_SIZE));
    const tileGeometry = this.track(new THREE.BoxGeometry(2.8, TILE_HEIGHT, 2.8));
    const shaftGeometry = this.track(new THREE.BoxGeometry(2.2, SHAFT_HEIGHT, 2.2));
    const unit = this.track(new THREE.BoxGeometry(1, 1, 1));
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    for (const floor of HOTEL_FLOORS) {
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
        new THREE.MeshStandardMaterial({ color: new THREE.Color(tokens.surface), roughness: 0.95, transparent: true, opacity: 0.96 }),
      );
      const slab = new THREE.Mesh(this.track(new THREE.BoxGeometry(maxX - minX, 0.24, maxZ - minZ)), slabMaterial);
      slab.position.set((minX + maxX) / 2, y - 0.12, (minZ + maxZ) / 2);
      group.add(slab);
      materials.push(slabMaterial);

      const edgeMaterial = this.track(
        new THREE.LineBasicMaterial({ color: new THREE.Color(tokens.line), transparent: true, opacity: 0.9 }),
      );
      const outline = new THREE.LineSegments(this.track(new THREE.EdgesGeometry(slab.geometry)), edgeMaterial);
      outline.position.copy(slab.position);
      group.add(outline);
      materials.push(edgeMaterial);

      // Walkways: every edge between two non-room places on this floor, plus door stubs to rooms.
      const walkMaterial = this.track(
        new THREE.MeshStandardMaterial({ color: new THREE.Color(tokens.sunken), roughness: 0.9, transparent: true, opacity: 1 }),
      );
      const doorMaterial = this.track(
        new THREE.MeshStandardMaterial({ color: new THREE.Color(tokens.line), roughness: 0.9, transparent: true, opacity: 1 }),
      );
      const floorEdges = HOTEL_EDGES.filter((edge) => {
        const a = HOTEL_NODES[edge.a];
        const b = HOTEL_NODES[edge.b];
        return a && b && a.floor === floor && b.floor === floor;
      });
      const walkways = floorEdges.filter((edge) => HOTEL_NODES[edge.a].kind !== "room" && HOTEL_NODES[edge.b].kind !== "room");
      const doors = floorEdges.filter((edge) => HOTEL_NODES[edge.a].kind === "room" || HOTEL_NODES[edge.b].kind === "room");
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
      const rooms = HOTEL_ROOMS.filter((room) => room.floor === floor);
      const roomMaterial = this.track(
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, transparent: true, opacity: 1 }),
      );
      const roomMesh = new THREE.InstancedMesh(roomGeometry, roomMaterial, rooms.length);
      rooms.forEach((room, index) => {
        matrix.makeTranslation(room.x, y + ROOM_HEIGHT / 2, room.z);
        roomMesh.setMatrixAt(index, matrix);
        const colour = new THREE.Color(tokens[STATUS_TOKEN.ukjent]);
        roomMesh.setColorAt(index, colour);
        this.rooms.set(room.id, { index, floor, colour, status: "ukjent", mesh: roomMesh });
        const tag = label(roomNumber(room.id), "h3d-room");
        tag.position.set(room.x, y + ROOM_HEIGHT + 0.05, room.z);
        group.add(tag);
        labels.push(tag.element);
      });
      roomMesh.instanceMatrix.needsUpdate = true;
      if (roomMesh.instanceColor) roomMesh.instanceColor.needsUpdate = true;
      group.add(roomMesh);
      materials.push(roomMaterial);
      this.disposables.push(roomMesh);

      // Hubs, service rooms, elevators and stairs: tiles with a name.
      const tileMaterial = this.track(
        new THREE.MeshStandardMaterial({ color: new THREE.Color(tokens.sunken), roughness: 0.9, transparent: true, opacity: 1 }),
      );
      const shaftMaterial = this.track(
        new THREE.MeshStandardMaterial({ color: new THREE.Color(tokens.lineStrong), roughness: 0.7, transparent: true, opacity: 0.85 }),
      );
      for (const node of nodes) {
        if (node.kind === "room" || node.kind === "corridor") continue;
        const vertical = node.kind === "elevator" || node.kind === "stairwell";
        const mesh = new THREE.Mesh(vertical ? shaftGeometry : tileGeometry, vertical ? shaftMaterial : tileMaterial);
        mesh.position.set(node.x, y + (vertical ? SHAFT_HEIGHT / 2 : TILE_HEIGHT / 2), node.z);
        group.add(mesh);
        const tag = label(placeName(node.id), vertical ? "h3d-place h3d-place-shaft" : "h3d-place");
        tag.position.set(node.x, y + (vertical ? SHAFT_HEIGHT : TILE_HEIGHT) + 0.05, node.z);
        group.add(tag);
        labels.push(tag.element);
      }
      materials.push(tileMaterial, shaftMaterial);

      const floorTag = label(`${floor}. etasje`, "h3d-floor");
      floorTag.center.set(1, 0.5);
      floorTag.position.set(minX - 0.6, y + 0.4, maxZ - 2);
      group.add(floorTag);
      labels.push(floorTag.element);

      this.scene.add(group);
      this.floors.push({ floor, group, materials, labels });
    }

    // The elevator and the stairs between floors, as a line through their landings.
    const linkMaterial = this.track(
      new THREE.LineBasicMaterial({ color: new THREE.Color(tokens.lineStrong), transparent: true, opacity: 0.55 }),
    );
    for (const prefix of ["elevator-", "stairwell-"]) {
      const points = HOTEL_FLOORS.map((floor) => this.positions.get(`${prefix}${floor}`))
        .filter((point): point is THREE.Vector3 => !!point)
        .map((point) => point.clone().setY(point.y + SHAFT_HEIGHT));
      if (points.length < 2) continue;
      const geometry = this.track(new THREE.BufferGeometry().setFromPoints(points));
      this.scene.add(new THREE.Line(geometry, linkMaterial));
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
    const target = this.robotPos.clone();
    const position = target.clone().add(FOCUS_OFFSET);
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

  /** Room colours, the robot's label and the highlighted room. Called at HUD rate, not per frame. */
  setSnapshot(snapshot: Snapshot | null) {
    const { tokens } = this;
    for (const [id, slot] of this.rooms) {
      const status = snapshot?.rooms[id]?.status ?? "ukjent";
      if (status === slot.status) continue;
      slot.status = status;
      const target = new THREE.Color(tokens[STATUS_TOKEN[status]]);
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
      const at = room ? this.positions.get(room) : undefined;
      this.attentionTween?.kill();
      this.attentionTween = null;
      if (at) {
        this.attention.position.set(at.x, at.y + ROOM_HEIGHT + 0.08, at.z);
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
    this.renderer.setSize(width, height, false);
    this.labelRenderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

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
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.attentionTween?.kill();
    this.ctx.revert();
    this.controls.dispose();
    for (const item of this.disposables) item.dispose();
    this.scene.traverse((object) => {
      if (object instanceof CSS2DObject) object.element.remove();
    });
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelLayer.replaceChildren();
  }
}

/** "2 × vannflaske, pute" from the item list. */
function summariseItems(items: string[]): string {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()].map(([item, count]) => (count > 1 ? `${count} × ${itemName(item)}` : itemName(item))).join(", ");
}
