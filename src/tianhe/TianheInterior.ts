import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import RAPIER from "@dimforge/rapier3d-compat";
import { TIANHE_ASSET_MANIFEST } from "../data/tianheAssetManifest";
import { TIANHE_FIXED_TIMESTEP, TianhePhysics } from "./TianhePhysics";

const MOUSE_SENSITIVITY = 0.00165;
const ROLL_SPEED = 1.15;

type LightingMode = "工作照明" | "休息照明" | "应急照明";

export interface TianheStatus {
  speed: number;
  position: [number, number, number];
  lighting: LightingMode;
  target: string;
  grabbed: boolean;
  pointerLocked: boolean;
}

interface TianheInteriorOptions {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  onStatus: (status: TianheStatus) => void;
}

export class TianheInterior {
  readonly root: THREE.Group;

  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly onStatus: (status: TianheStatus) => void;
  private readonly physics: TianhePhysics;
  private readonly spawnQuaternion = new THREE.Quaternion();
  private readonly orientation = new THREE.Quaternion();
  private readonly pressedKeys = new Set<string>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly interactiveMeshes: THREE.Object3D[] = [];
  private readonly cabinLights: THREE.PointLight[] = [];
  private readonly lightFixtures: THREE.Mesh[] = [];
  private readonly movementVector = new THREE.Vector3();
  private readonly rotationIncrement = new THREE.Quaternion();
  private readonly stationUp = new THREE.Vector3(0, 1, 0);

  private active = false;
  private accumulator = 0;
  private lightingIndex = 0;
  private lightingModes: LightingMode[] = ["工作照明", "休息照明", "应急照明"];
  private communicationIndex = 0;
  private diningDeployed = false;
  private exerciseLevel = 1;
  private interactionFeedback = "";
  private feedbackExpiresAt = 0;
  private currentTarget: THREE.Object3D | null = null;
  private communicationScreen!: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private diningTable!: THREE.Mesh;
  private exerciseHandle!: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

  static async load(options: TianheInteriorOptions): Promise<TianheInterior> {
    await RAPIER.init();
    const [gltf, surfaceDetail] = await Promise.all([
      new GLTFLoader().loadAsync(TIANHE_ASSET_MANIFEST.model),
      new THREE.TextureLoader().loadAsync(TIANHE_ASSET_MANIFEST.surfaceDetail),
    ]);
    surfaceDetail.wrapS = THREE.RepeatWrapping;
    surfaceDetail.wrapT = THREE.RepeatWrapping;
    surfaceDetail.repeat.set(1, 1);
    surfaceDetail.anisotropy = 8;
    return new TianheInterior(options, gltf.scene, surfaceDetail);
  }

  private constructor(options: TianheInteriorOptions, root: THREE.Group, surfaceDetail: THREE.Texture) {
    this.scene = options.scene;
    this.camera = options.camera;
    this.canvas = options.canvas;
    this.onStatus = options.onStatus;
    this.root = root;
    this.root.name = "TianheInterior";
    this.root.visible = false;
    this.scene.add(this.root);

    this.physics = new TianhePhysics(this.root);
    this.prepareAsset(surfaceDetail);
    this.bindEvents();
    this.applyLightingMode();
  }

  enter(): void {
    this.active = true;
    this.root.visible = true;
    this.accumulator = 0;
    this.orientation.copy(this.spawnQuaternion);
    this.camera.quaternion.copy(this.orientation);
    this.camera.near = 0.04;
    this.camera.fov = 60;
    this.camera.updateProjectionMatrix();
    this.physics.reset();
    this.emitStatus();
  }

  exit(): void {
    this.releaseHandrail();
    this.active = false;
    this.root.visible = false;
    this.pressedKeys.clear();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  requestPointerLock(): void {
    if (this.active && document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock();
  }

  update(deltaSeconds: number): void {
    if (!this.active) return;
    this.accumulator = Math.min(this.accumulator + deltaSeconds, 0.1);
    while (this.accumulator >= TIANHE_FIXED_TIMESTEP) {
      this.stepPhysics();
      this.accumulator -= TIANHE_FIXED_TIMESTEP;
    }

    const position = this.physics.playerBody.translation();
    this.camera.position.set(position.x, position.y, position.z);
    this.camera.quaternion.copy(this.orientation);
    this.updateDynamicInteractions(deltaSeconds);
    this.updateTarget();
    this.emitStatus();
  }

  private prepareAsset(surfaceDetail: THREE.Texture): void {
    this.root.updateMatrixWorld(true);
    this.root.traverse((object) => {
      if (object.name === TIANHE_ASSET_MANIFEST.spawnNode) {
        object.getWorldQuaternion(this.spawnQuaternion);
      }
      if (object.name.startsWith("INTERACT_") && object instanceof THREE.Mesh) {
        this.interactiveMeshes.push(object);
      }
      if (object.name.startsWith("LIGHT_FIXTURE_") && object instanceof THREE.Mesh) {
        this.lightFixtures.push(object);
      }
      if (object.name === "VIS_CommunicationScreen" && object instanceof THREE.Mesh) {
        object.material = (object.material as THREE.MeshStandardMaterial).clone();
        this.communicationScreen = object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      }
      if (object.name === "INTERACT_Tianhe_DiningTable" && object instanceof THREE.Mesh) {
        this.diningTable = object;
      }
      if (object.name === "INTERACT_Tianhe_Exercise" && object instanceof THREE.Mesh) {
        object.material = (object.material as THREE.MeshStandardMaterial).clone();
        this.exerciseHandle = object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      }
      if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const entry of materials) {
          if (!(entry instanceof THREE.MeshStandardMaterial)) continue;
          if (/White|Fabric|Insulation|Panel|Sleep Bag/.test(entry.name)) {
            entry.bumpMap = surfaceDetail;
            entry.bumpScale = /Fabric|Insulation|Sleep Bag/.test(entry.name) ? 0.015 : 0.003;
            entry.roughnessMap = surfaceDetail;
            entry.needsUpdate = true;
          }
        }
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });

    const ambient = new THREE.HemisphereLight(0xf8fbf8, 0xb9c6c5, 1.45);
    ambient.name = "Tianhe_Ambient";
    this.root.add(ambient);
    for (const z of [-5.2, -2.6, 0, 2.6, 5.2]) {
      const light = new THREE.PointLight(0xf7faf7, 2.4, 6.6, 1.7);
      light.name = `Tianhe_CabinLight_${z}`;
      light.position.set(0, 1.0, z);
      light.castShadow = z === 0;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.0002;
      this.root.add(light);
      this.cabinLights.push(light);
    }
  }

  private bindEvents(): void {
    window.addEventListener("keydown", (event) => {
      if (!this.active) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
      this.pressedKeys.add(event.code);
      if (!event.repeat && event.code === "KeyE") this.activateTarget();
      if (!event.repeat && event.code === "KeyF") this.toggleHandrail();
    });
    window.addEventListener("keyup", (event) => this.pressedKeys.delete(event.code));
    window.addEventListener("blur", () => this.pressedKeys.clear());
    document.addEventListener("mousemove", (event) => {
      if (!this.active || document.pointerLockElement !== this.canvas) return;
      this.rotationIncrement.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -event.movementX * MOUSE_SENSITIVITY);
      this.orientation.multiply(this.rotationIncrement);
      this.rotationIncrement.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -event.movementY * MOUSE_SENSITIVITY);
      this.orientation.multiply(this.rotationIncrement).normalize();
    });
    document.addEventListener("pointerlockchange", () => this.emitStatus());
  }

  private stepPhysics(): void {
    this.updateRoll();
    this.getMovementDirection(this.movementVector);
    const boost = this.pressedKeys.has("ShiftLeft") || this.pressedKeys.has("ShiftRight");
    this.physics.step(this.movementVector, boost);
  }

  private getMovementDirection(target: THREE.Vector3): THREE.Vector3 {
    const forward = Number(this.pressedKeys.has("KeyW") || this.pressedKeys.has("ArrowUp"))
      - Number(this.pressedKeys.has("KeyS") || this.pressedKeys.has("ArrowDown"));
    const right = Number(this.pressedKeys.has("KeyD") || this.pressedKeys.has("ArrowRight"))
      - Number(this.pressedKeys.has("KeyA") || this.pressedKeys.has("ArrowLeft"));
    const up = Number(this.pressedKeys.has("Space")) - Number(this.pressedKeys.has("ControlLeft") || this.pressedKeys.has("ControlRight"));
    target.set(right, up, -forward).applyQuaternion(this.orientation);
    return target;
  }

  private updateRoll(): void {
    const roll = Number(this.pressedKeys.has("KeyC")) - Number(this.pressedKeys.has("KeyZ"));
    if (roll !== 0) {
      this.rotationIncrement.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -roll * ROLL_SPEED * TIANHE_FIXED_TIMESTEP);
      this.orientation.multiply(this.rotationIncrement).normalize();
    }
    if (this.pressedKeys.has("KeyR")) {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.orientation);
      const corrected = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), forward, this.stationUp));
      this.orientation.slerp(corrected, 0.045).normalize();
    }
  }

  private updateTarget(): void {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = 1.65;
    this.currentTarget = this.raycaster.intersectObjects(this.interactiveMeshes, false)[0]?.object ?? null;
  }

  private activateTarget(): void {
    const interaction = this.currentTarget?.userData.interaction;
    if (!interaction) return;
    if (interaction === "lighting") {
      this.lightingIndex = (this.lightingIndex + 1) % this.lightingModes.length;
      this.applyLightingMode();
      this.setFeedback(this.lightingModes[this.lightingIndex]);
    } else if (interaction === "communication") {
      const modes = ["天地通信 · 待命", "视频链路 · 已连接", "邮件链路 · 同步完成"];
      this.communicationIndex = (this.communicationIndex + 1) % modes.length;
      const colors = [0x59b8c3, 0x5dd58b, 0xe7bd58];
      this.communicationScreen.material.emissive.setHex(colors[this.communicationIndex]);
      this.setFeedback(modes[this.communicationIndex]);
    } else if (interaction === "dining") {
      this.diningDeployed = !this.diningDeployed;
      this.setFeedback(this.diningDeployed ? "就餐台 · 展开锁定" : "就餐台 · 收纳锁定");
    } else if (interaction === "sleep") {
      this.lightingIndex = 1;
      this.applyLightingMode();
      this.setFeedback("睡眠区 · 休息照明");
    } else if (interaction === "exercise") {
      this.exerciseLevel = (this.exerciseLevel % 3) + 1;
      this.exerciseHandle.material.emissive.setHex(0x174b79);
      this.exerciseHandle.material.emissiveIntensity = 0.25 * this.exerciseLevel;
      this.setFeedback(`抗阻训练 · ${this.exerciseLevel} 级`);
    }
  }

  private setFeedback(message: string): void {
    this.interactionFeedback = message;
    this.feedbackExpiresAt = performance.now() + 2200;
  }

  private updateDynamicInteractions(deltaSeconds: number): void {
    const targetRotation = this.diningDeployed ? -0.82 : -0.12;
    this.diningTable.rotation.z = THREE.MathUtils.damp(this.diningTable.rotation.z, targetRotation, 7, deltaSeconds);
  }

  private applyLightingMode(): void {
    const mode = this.lightingModes[this.lightingIndex];
    const color = mode === "工作照明" ? 0xf7faf7 : mode === "休息照明" ? 0xa7bbce : 0xe84035;
    const intensity = mode === "工作照明" ? 2.4 : mode === "休息照明" ? 1.15 : 2.4;
    for (const light of this.cabinLights) {
      light.color.setHex(color);
      light.intensity = intensity;
    }
    for (const fixture of this.lightFixtures) {
      const fixtureMaterial = fixture.material as THREE.MeshStandardMaterial;
      fixtureMaterial.emissive.setHex(color);
      fixtureMaterial.emissiveIntensity = mode === "工作照明" ? 1.25 : mode === "休息照明" ? 0.55 : 1.7;
    }
  }

  private toggleHandrail(): void {
    if (this.physics.grabbed) {
      this.releaseHandrail();
      return;
    }
    if (this.currentTarget?.userData.interaction !== "handrail") return;
    const hit = this.raycaster.intersectObject(this.currentTarget, false)[0];
    if (!hit) return;
    this.physics.grab(hit.point);
  }

  private releaseHandrail(): void {
    this.physics.release();
  }

  private emitStatus(): void {
    const velocity = this.physics.playerBody.linvel();
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
    this.onStatus({
      speed,
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      lighting: this.lightingModes[this.lightingIndex],
      target: performance.now() < this.feedbackExpiresAt
        ? this.interactionFeedback
        : this.currentTarget?.userData.label ?? (this.currentTarget?.userData.interaction === "handrail" ? "舱内扶手" : ""),
      grabbed: this.physics.grabbed,
      pointerLocked: document.pointerLockElement === this.canvas,
    });
  }
}
