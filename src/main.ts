import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { MODULES, MODULE_IDS, type ModuleAxis, type ModuleId, type StationModule, vector } from "./data/stationModules";
import { EXTERIOR_ASSET_MANIFEST } from "./data/exteriorAssetManifest";
import "./styles.css";

type SceneMode = "LOADING" | "OVERVIEW" | "TRANSITION" | "INTERIOR" | "ERROR";

interface InteriorScene {
  group: THREE.Group;
  spawnPoint: THREE.Vector3;
  focusPoint: THREE.Vector3;
}

interface TransitionState {
  kind: "enter" | "exit";
  moduleId?: ModuleId;
  startedAt: number;
  duration: number;
  fromPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toPosition: THREE.Vector3;
  toTarget: THREE.Vector3;
  switched: boolean;
}

const DEFAULT_CAMERA_POSITION = new THREE.Vector3(10, 47, -45);
const MOBILE_CAMERA_POSITION = new THREE.Vector3(36, 94, -118);
const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, 0.5, -4.2);
const ORBITAL_PERIOD_SECONDS = 92 * 60;
const EARTH_SIDEREAL_PERIOD_SECONDS = 23 * 60 * 60 + 56 * 60 + 4.0905;
const ORBIT_TIME_SCALE = 12;
const ORBIT_ANGULAR_SPEED = (Math.PI * 2) / ORBITAL_PERIOD_SECONDS;
const EARTH_ANGULAR_SPEED = (Math.PI * 2) / EARTH_SIDEREAL_PERIOD_SECONDS;
const SIMULATION_EPOCH_MS = Date.now();
const EARTH_INITIAL_YAW = -0.55;
const EARTH_POSITION = new THREE.Vector3(-10, -92, 165);
const SUN_BASE_POSITION = new THREE.Vector3(-28, 34, -22);
const ORBIT_AXIS = new THREE.Vector3(0.22, 0.94, 0.26).normalize();

function getOverviewCameraPosition(): THREE.Vector3 {
  return window.innerWidth <= 700 ? MOBILE_CAMERA_POSITION : DEFAULT_CAMERA_POSITION;
}

const sceneRoot = document.querySelector<HTMLDivElement>("#scene-root")!;
const loadingScreen = document.querySelector<HTMLDivElement>("#loading-screen")!;
const loadingDetail = document.querySelector<HTMLSpanElement>("#loading-detail")!;
const topbar = document.querySelector<HTMLElement>("#topbar")!;
const modeIndicator = document.querySelector<HTMLDivElement>("#mode-indicator")!;
const overviewCopy = document.querySelector<HTMLElement>("#overview-copy")!;
const modulePanel = document.querySelector<HTMLElement>("#module-panel")!;
const panelTitle = document.querySelector<HTMLElement>("#panel-title")!;
const panelDescription = document.querySelector<HTMLElement>("#panel-description")!;
const enterButton = document.querySelector<HTMLButtonElement>("#enter-button")!;
const interiorToolbar = document.querySelector<HTMLElement>("#interior-toolbar")!;
const interiorTitle = document.querySelector<HTMLElement>("#interior-title")!;
const backButton = document.querySelector<HTMLButtonElement>("#back-button")!;
const resetButton = document.querySelector<HTMLButtonElement>("#reset-button")!;
const toast = document.querySelector<HTMLDivElement>("#toast")!;
const transitionVeil = document.querySelector<HTMLDivElement>("#transition-veil")!;
const orbitStatus = document.querySelector<HTMLDivElement>("#orbit-status")!;

if (
  !sceneRoot ||
  !loadingScreen ||
  !loadingDetail ||
  !topbar ||
  !modeIndicator ||
  !overviewCopy ||
  !modulePanel ||
  !panelTitle ||
  !panelDescription ||
  !enterButton ||
  !interiorToolbar ||
  !interiorTitle ||
  !backButton ||
  !resetButton ||
  !toast ||
  !transitionVeil ||
  !orbitStatus
) {
  throw new Error("Required application UI is missing.");
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x315e72);
scene.fog = new THREE.FogExp2(0x315e72, 0.0008);

const camera = new THREE.PerspectiveCamera(window.innerWidth <= 700 ? 53 : 38, window.innerWidth / window.innerHeight, 0.1, 360);
camera.position.copy(getOverviewCameraPosition());

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.11;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sceneRoot.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
const gtaoPass = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
gtaoPass.blendIntensity = 0.34;
gtaoPass.updateGtaoMaterial({
  radius: 0.36,
  distanceExponent: 1.45,
  thickness: 1.25,
  distanceFallOff: 0.85,
  scale: 1,
  samples: 8,
  screenSpaceRadius: true,
});
gtaoPass.updatePdMaterial({ radius: 6, rings: 2, samples: 8 });
composer.addPass(gtaoPass);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 12;
controls.maxDistance = 140;
controls.maxPolarAngle = Math.PI * 0.86;
controls.target.copy(DEFAULT_CAMERA_TARGET);
controls.update();

const overviewGroup = new THREE.Group();
overviewGroup.name = "OverviewExterior";
scene.add(overviewGroup);

const interiorRoot = new THREE.Group();
interiorRoot.name = "InteriorScenes";
scene.add(interiorRoot);

const hotspotMeshes: THREE.Mesh[] = [];
const labels = new Map<ModuleId, HTMLButtonElement>();
const interiorScenes = new Map<ModuleId, InteriorScene>();
const gltfLoader = new GLTFLoader();

let mode: SceneMode = "LOADING";
let selectedModule: ModuleId | null = null;
let hoveredModule: ModuleId | null = null;
let activeInterior: ModuleId | null = null;
let transition: TransitionState | null = null;
let toastTimer: number | undefined;
let earthSurface: THREE.Mesh | null = null;
let earthCloudLayer: THREE.Mesh | null = null;
let earthNightLayer: THREE.Mesh | null = null;
let starfield: THREE.Points | null = null;
let sunLight: THREE.DirectionalLight | null = null;
let compactViewport = window.innerWidth <= 700;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pointerDown = new THREE.Vector2();

const exteriorMaterial = new THREE.MeshStandardMaterial({
  color: 0xc7d0cf,
  roughness: 0.72,
  metalness: 0.16,
});
const exteriorPanelMaterial = new THREE.MeshStandardMaterial({
  color: 0x667476,
  roughness: 0.66,
  metalness: 0.35,
});
const solarMaterial = new THREE.MeshStandardMaterial({
  color: 0x10283d,
  roughness: 0.48,
  metalness: 0.34,
  emissive: 0x050b12,
});
const solarGridMaterial = new THREE.MeshStandardMaterial({
  color: 0x70858a,
  roughness: 0.42,
  metalness: 0.66,
});
const thermalMaterial = new THREE.MeshStandardMaterial({
  color: 0xa7b0aa,
  roughness: 0.78,
  metalness: 0.08,
});
const darkEquipmentMaterial = new THREE.MeshStandardMaterial({
  color: 0x273b42,
  roughness: 0.56,
  metalness: 0.42,
});
const interiorWallMaterial = new THREE.MeshStandardMaterial({
  color: 0x9caeac,
  roughness: 0.86,
  metalness: 0.04,
  emissive: 0x172527,
  emissiveIntensity: 0.22,
  side: THREE.DoubleSide,
});
const interiorFloorMaterial = new THREE.MeshStandardMaterial({
  color: 0x25353a,
  roughness: 0.84,
  metalness: 0.12,
});
const interiorPanelMaterial = new THREE.MeshStandardMaterial({
  color: 0x3f5e62,
  roughness: 0.65,
  metalness: 0.24,
  emissive: 0x071315,
});
const labelHotspotMaterial = new THREE.MeshBasicMaterial({
  color: 0xb9f0ef,
  transparent: true,
  opacity: 0,
  depthWrite: false,
});

function addLights(): void {
  const hemisphere = new THREE.HemisphereLight(0xe4f0ed, 0x18333b, 1.0);
  scene.add(hemisphere);

  sunLight = new THREE.DirectionalLight(0xfff5e2, 4.1);
  sunLight.position.copy(SUN_BASE_POSITION);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 130;
  sunLight.shadow.camera.left = -48;
  sunLight.shadow.camera.right = 48;
  sunLight.shadow.camera.top = 48;
  sunLight.shadow.camera.bottom = -48;
  sunLight.shadow.bias = -0.00035;
  scene.add(sunLight);

  const fill = new THREE.DirectionalLight(0xb5dce2, 1.35);
  fill.position.set(16, -8, -30);
  scene.add(fill);
}

function addStarfield(): void {
  const positions = new Float32Array(720 * 3);
  for (let index = 0; index < 720; index += 1) {
    const radius = 85 + ((index * 47) % 95);
    const theta = (index * 2.399963) % (Math.PI * 2);
    const phi = Math.acos(1 - 2 * ((index + 1) / 721));
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.cos(phi);
    positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xc8e2e4,
    size: 0.12,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.62,
  });
  starfield = new THREE.Points(geometry, material);
  starfield.name = "Orbital_Starfield";
  scene.add(starfield);
}

function addEarthHorizon(): void {
  const textureLoader = new THREE.TextureLoader();
  const earthTexture = textureLoader.load("/textures/earth/earth_blue_marble_2048.png");
  earthTexture.colorSpace = THREE.SRGBColorSpace;
  const earthSpecular = textureLoader.load("/textures/earth/earth_specular_2048.jpg");
  const earthNormal = textureLoader.load("/textures/earth/earth_normal_2048.jpg");
  const earthLights = textureLoader.load("/textures/earth/earth_lights_2048.png");
  earthLights.colorSpace = THREE.SRGBColorSpace;
  const cloudTexture = textureLoader.load("/textures/earth/earth_clouds_1024.png");
  cloudTexture.colorSpace = THREE.SRGBColorSpace;
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (const texture of [earthTexture, earthSpecular, earthNormal, earthLights, cloudTexture]) {
    texture.anisotropy = anisotropy;
  }

  const earthGeometry = new THREE.SphereGeometry(60, 192, 128);

  earthSurface = new THREE.Mesh(
    earthGeometry,
    new THREE.MeshPhongMaterial({
      map: earthTexture,
      color: 0xffffff,
      specularMap: earthSpecular,
      normalMap: earthNormal,
      normalScale: new THREE.Vector2(0.72, 0.72),
      specular: new THREE.Color(0x8eb9c9),
      shininess: 19,
    }),
  );
  earthSurface.name = "Earth_RealTexture";
  // Blender's +Y flag face exports toward Three.js -Z. Earth sits in +Z so
  // the marked face points away from Earth, with extra orbital separation.
  earthSurface.position.copy(EARTH_POSITION);
  earthSurface.rotation.x = 0.08;
  earthSurface.rotation.y = EARTH_INITIAL_YAW;
  earthSurface.rotation.z = Math.PI / 2 - 0.18;
  scene.add(earthSurface);

  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(0x4ca9d4) },
      intensity: { value: 0.82 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDirection;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDirection = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float intensity;
      varying vec3 vNormal;
      varying vec3 vViewDirection;
      void main() {
        float fresnel = pow(1.0 - max(dot(vNormal, vViewDirection), 0.0), 3.2);
        gl_FragColor = vec4(glowColor, fresnel * intensity);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(61.2, 192, 128),
    atmosphereMaterial,
  );
  atmosphere.position.copy(earthSurface.position);
  atmosphere.name = "Earth_Atmosphere";
  scene.add(atmosphere);

  earthNightLayer = new THREE.Mesh(
    new THREE.SphereGeometry(60.05, 192, 128),
    new THREE.ShaderMaterial({
      uniforms: {
        nightMap: { value: earthLights },
        sunDirection: { value: SUN_BASE_POSITION.clone().normalize() },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        void main() {
          vUv = uv;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D nightMap;
        uniform vec3 sunDirection;
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        void main() {
          vec3 lights = texture2D(nightMap, vUv).rgb;
          float night = 1.0 - smoothstep(-0.28, 0.10, dot(normalize(vWorldNormal), normalize(sunDirection)));
          float brightness = max(max(lights.r, lights.g), lights.b);
          gl_FragColor = vec4(lights * 1.25, brightness * night * 0.78);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  earthNightLayer.name = "Earth_NightLights";
  earthNightLayer.position.copy(earthSurface.position);
  earthNightLayer.rotation.copy(earthSurface.rotation);
  scene.add(earthNightLayer);

  earthCloudLayer = new THREE.Mesh(
    new THREE.SphereGeometry(60.42, 192, 128),
    new THREE.MeshPhongMaterial({
      map: cloudTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      shininess: 2,
      specular: new THREE.Color(0x30444b),
    }),
  );
  earthCloudLayer.name = "Earth_CloudLayer";
  earthCloudLayer.position.copy(earthSurface.position);
  earthCloudLayer.rotation.copy(earthSurface.rotation);
  scene.add(earthCloudLayer);
}

function axisRotation(axis: ModuleAxis): THREE.Euler {
  return axis === "x" ? new THREE.Euler(0, 0, Math.PI / 2) : new THREE.Euler(Math.PI / 2, 0, 0);
}

function addRing(parent: THREE.Group, radius: number, depth: number, axis: ModuleAxis, color = 0x7f9392): void {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.07, 8, 48),
    new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.35 }),
  );
  ring.rotation.copy(axisRotation(axis));
  ring.position.copy(axis === "x" ? new THREE.Vector3(depth, 0, 0) : new THREE.Vector3(0, 0, depth));
  parent.add(ring);
}

function addHatch(parent: THREE.Group, radius: number, depth: number, axis: ModuleAxis): void {
  const hatch = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.72, radius * 0.72, 0.16, 32),
    new THREE.MeshStandardMaterial({ color: 0x4d6061, roughness: 0.6, metalness: 0.42 }),
  );
  hatch.rotation.copy(axisRotation(axis));
  hatch.position.copy(axis === "x" ? new THREE.Vector3(depth, 0, 0) : new THREE.Vector3(0, 0, depth));
  parent.add(hatch);
}

function addSolarArray(position: THREE.Vector3, compact = false): void {
  const array = new THREE.Group();
  array.name = compact ? "STA_Solar_Array_Small" : "STA_Solar_Array_Large";
  array.position.copy(position);

  const columns = compact ? 2 : 2;
  const rows = compact ? 3 : 7;
  const cellWidth = compact ? 1.35 : 1.9;
  const cellLength = compact ? 1.15 : 2.05;
  const gap = compact ? 0.12 : 0.16;
  const totalWidth = columns * cellWidth + (columns - 1) * gap;
  const totalLength = rows * cellLength + (rows - 1) * gap;
  const cellGeometry = new THREE.BoxGeometry(cellWidth, 0.08, cellLength);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cell = new THREE.Mesh(cellGeometry, solarMaterial);
      cell.position.set(
        (column - (columns - 1) / 2) * (cellWidth + gap),
        0,
        (row - (rows - 1) / 2) * (cellLength + gap),
      );
      array.add(cell);
    }
  }

  const frameThickness = compact ? 0.1 : 0.13;
  const frame = [
    new THREE.Mesh(new THREE.BoxGeometry(totalWidth + 0.24, frameThickness, frameThickness), solarGridMaterial),
    new THREE.Mesh(new THREE.BoxGeometry(totalWidth + 0.24, frameThickness, frameThickness), solarGridMaterial),
    new THREE.Mesh(new THREE.BoxGeometry(frameThickness, frameThickness, totalLength + 0.24), solarGridMaterial),
    new THREE.Mesh(new THREE.BoxGeometry(frameThickness, frameThickness, totalLength + 0.24), solarGridMaterial),
  ];
  frame[0].position.z = -totalLength / 2 - 0.08;
  frame[1].position.z = totalLength / 2 + 0.08;
  frame[2].position.x = -totalWidth / 2 - 0.08;
  frame[3].position.x = totalWidth / 2 + 0.08;
  for (const piece of frame) array.add(piece);

  const mast = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.14, totalLength + 1.2),
    exteriorPanelMaterial,
  );
  mast.position.y = -0.12;
  array.add(mast);

  const boom = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(1.4, Math.abs(position.x) - 18.2), 0.16, 0.16),
    exteriorPanelMaterial,
  );
  const boomLength = Math.max(1.4, Math.abs(position.x) - 18.2);
  boom.position.set(position.x < 0 ? boomLength / 2 : -boomLength / 2, -0.08, 0);
  array.add(boom);

  overviewGroup.add(array);
}

function addSolarBoom(from: THREE.Vector3, to: THREE.Vector3): void {
  const { midpoint, length } = pointBetween(from, to);
  const boom = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.16, length, 12),
    new THREE.MeshStandardMaterial({ color: 0x8b9a99, roughness: 0.54, metalness: 0.5 }),
  );
  boom.position.copy(midpoint);
  boom.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  overviewGroup.add(boom);
}

function pointBetween(a: THREE.Vector3, b: THREE.Vector3): { midpoint: THREE.Vector3; length: number } {
  return { midpoint: a.clone().add(b).multiplyScalar(0.5), length: a.distanceTo(b) };
}

function addArm(base: THREE.Vector3, direction: 1 | -1): void {
  const arm = new THREE.Group();
  arm.name = "RoboticArm";
  const points = [
    base.clone(),
    base.clone().add(new THREE.Vector3(direction * 2.1, 1.55, 1.6)),
    base.clone().add(new THREE.Vector3(direction * 4.3, 1.2, 0.4)),
    base.clone().add(new THREE.Vector3(direction * 5.4, 0.4, -1.7)),
  ];
  for (let index = 0; index < points.length - 1; index += 1) {
    const { midpoint, length } = pointBetween(points[index], points[index + 1]);
    const segment = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.2, length, 12),
      new THREE.MeshStandardMaterial({ color: 0xa7b5b4, roughness: 0.55, metalness: 0.52 }),
    );
    segment.position.copy(midpoint);
    segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), points[index + 1].clone().sub(points[index]).normalize());
    arm.add(segment);

    const joint = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x556c6e, roughness: 0.5, metalness: 0.55 }),
    );
    joint.position.copy(points[index]);
    arm.add(joint);
  }
  overviewGroup.add(arm);
}

function createExteriorModule(config: StationModule): void {
  const group = new THREE.Group();
  group.name = `STA_${config.id[0].toUpperCase()}${config.id.slice(1)}_Exterior`;
  group.position.copy(vector(config.exteriorPosition));

  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(config.radius * 0.98, config.radius * 1.02, config.length, 64, 1, false),
    new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.76,
      metalness: 0.11,
    }),
  );
  shell.rotation.copy(axisRotation(config.axis));
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);

  const ringOffsets = [-config.length * 0.36, -config.length * 0.12, config.length * 0.12, config.length * 0.36];
  for (const offset of ringOffsets) {
    addRing(group, config.radius * 1.01, offset, config.axis);
  }
  addHatch(group, config.radius, config.length / 2 + 0.1, config.axis);
  addHatch(group, config.radius, -config.length / 2 - 0.1, config.axis);

  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x879493, roughness: 0.56, metalness: 0.42 });
  for (const angle of [0.25, Math.PI / 2 + 0.25, Math.PI + 0.25, Math.PI * 1.5 + 0.25]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(config.axis === "x" ? config.length * 0.84 : 0.1, 0.11, config.axis === "z" ? config.length * 0.84 : 0.1),
      railMaterial,
    );
    rail.position.set(Math.cos(angle) * config.radius * 0.88, Math.sin(angle) * config.radius * 0.88, 0);
    group.add(rail);
  }

  const equipmentOffsets = [-0.34, -0.08, 0.18, 0.38];
  for (let index = 0; index < equipmentOffsets.length; index += 1) {
    const equipment = new THREE.Mesh(
      new THREE.BoxGeometry(config.axis === "x" ? 1.5 : 0.56, 0.5 + (index % 2) * 0.12, config.axis === "z" ? 1.5 : 0.56),
      index % 2 === 0 ? exteriorPanelMaterial : darkEquipmentMaterial,
    );
    const depth = config.length * equipmentOffsets[index];
    if (config.axis === "x") {
      equipment.position.set(depth, config.radius * 0.76, 0.15);
    } else {
      equipment.position.set(0.15, config.radius * 0.76, depth);
    }
    group.add(equipment);
  }

  const thermalBand = new THREE.Mesh(
    new THREE.BoxGeometry(config.axis === "x" ? config.length * 0.3 : 0.32, 0.045, config.axis === "z" ? config.length * 0.3 : 0.32),
    thermalMaterial,
  );
  thermalBand.position.set(0, -config.radius * 0.88, 0);
  group.add(thermalBand);

  const servicePanel = new THREE.Mesh(
    new THREE.BoxGeometry(config.axis === "x" ? 0.12 : 1.05, 0.48, config.axis === "x" ? 1.7 : 0.12),
    exteriorPanelMaterial,
  );
  servicePanel.position.set(0, config.radius * 0.78, 0);
  if (config.axis === "x") {
    servicePanel.position.x = config.length * 0.08;
  } else {
    servicePanel.position.z = config.length * 0.08;
  }
  group.add(servicePanel);

  overviewGroup.add(group);

  const hotspot = new THREE.Mesh(new THREE.SphereGeometry(config.radius * 1.35, 16, 12), labelHotspotMaterial);
  hotspot.name = `HOTSPOT_Module_${config.id}`;
  hotspot.position.copy(vector(config.exteriorPosition));
  hotspot.userData.moduleId = config.id;
  hotspot.userData.kind = "module-hotspot";
  overviewGroup.add(hotspot);
  hotspotMeshes.push(hotspot);
}

function addModuleHotspots(): void {
  for (const id of MODULE_IDS) {
    const config = MODULES[id];
    const hotspot = new THREE.Mesh(new THREE.SphereGeometry(config.radius * 1.35, 16, 12), labelHotspotMaterial);
    hotspot.name = `HOTSPOT_Module_${config.id}`;
    hotspot.position.copy(vector(config.exteriorPosition));
    hotspot.userData.moduleId = config.id;
    hotspot.userData.kind = "module-hotspot";
    overviewGroup.add(hotspot);
    hotspotMeshes.push(hotspot);
  }
}

function createHullDetailTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(256, 256);
  for (let index = 0; index < image.data.length; index += 4) {
    const noise = 178 + Math.floor(Math.random() * 42);
    image.data[index] = noise;
    image.data[index + 1] = noise;
    image.data[index + 2] = noise;
    image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  context.strokeStyle = "rgba(45, 54, 56, 0.7)";
  context.lineWidth = 2;
  for (let x = 0; x <= 256; x += 64) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, 256);
    context.stroke();
  }
  for (let y = 0; y <= 256; y += 48) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(256, y);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 6);
  return texture;
}

function createSolarCellTexture(warm = false): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const gradient = context.createLinearGradient(0, 0, 256, 256);
  gradient.addColorStop(0, warm ? "#351219" : "#172e4a");
  gradient.addColorStop(0.48, warm ? "#71302f" : "#365c7d");
  gradient.addColorStop(1, warm ? "#240c13" : "#101f36");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  context.strokeStyle = "rgba(210, 150, 91, 0.84)";
  context.lineWidth = 1;
  for (let x = 0; x <= 256; x += 16) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, 256);
    context.stroke();
  }
  for (let y = 0; y <= 256; y += 16) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(256, y);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 4);
  return texture;
}

function enhanceBlenderMaterials(root: THREE.Object3D): void {
  const hullDetail = createHullDetailTexture();
  const warmSolarCells = createSolarCellTexture(true);
  const coolSolarCells = createSolarCellTexture();
  const updatedMaterials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial) || updatedMaterials.has(material)) continue;
      updatedMaterials.add(material);
      if (/Thermal White|Sunlit White|Thermal Blanket/i.test(material.name)) {
        material.bumpMap = hullDetail;
        material.roughnessMap = hullDetail;
        material.bumpScale = 0.035;
        material.roughness = Math.max(material.roughness, 0.68);
      }
      if (/Solar Cell Umber|Core Solar Cell/i.test(material.name)) {
        const isWarmArray = /Umber/i.test(material.name);
        material.map = isWarmArray ? warmSolarCells : coolSolarCells;
        material.color.set(0xffffff);
        material.emissiveMap = isWarmArray ? warmSolarCells : coolSolarCells;
        material.emissive.set(isWarmArray ? 0x4a1a20 : 0x274761);
        material.emissiveIntensity = isWarmArray ? 0.48 : 0.64;
        material.roughness = 0.5;
        material.metalness = 0.24;
      }
      material.needsUpdate = true;
    }
  });
}

async function loadBlenderExterior(): Promise<void> {
  const gltf = await gltfLoader.loadAsync(EXTERIOR_ASSET_MANIFEST.model);
  gltf.scene.name = "Blender_Station_Exterior_V5";
  enhanceBlenderMaterials(gltf.scene);
  gltf.scene.traverse((object) => {
    if (object.name.startsWith("HOTSPOT_")) object.visible = false;
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  overviewGroup.add(gltf.scene);
  addModuleHotspots();
}

function addDockingNode(): void {
  const node = new THREE.Mesh(
    new THREE.SphereGeometry(2.38, 48, 32),
    new THREE.MeshStandardMaterial({ color: 0xbac6c4, roughness: 0.7, metalness: 0.2 }),
  );
  node.name = "STA_Central_Node";
  node.scale.set(1.2, 0.86, 1.2);
  node.position.set(0, 0, 0);
  overviewGroup.add(node);

  for (const rotation of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const port = new THREE.Mesh(
      new THREE.CylinderGeometry(0.56, 0.56, 0.2, 24),
      new THREE.MeshStandardMaterial({ color: 0x4d6061, roughness: 0.58, metalness: 0.38 }),
    );
    port.name = "STA_Docking_Port";
    port.rotation.z = Math.PI / 2;
    port.rotation.y = rotation;
    port.position.set(Math.cos(rotation) * 2.26, 0.15, Math.sin(rotation) * 2.26);
    overviewGroup.add(port);
  }

  const spine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72, 0.72, 4.6, 32),
    new THREE.MeshStandardMaterial({ color: 0x9aa8a5, roughness: 0.74, metalness: 0.2 }),
  );
  spine.name = "STA_Central_Spine";
  spine.rotation.x = Math.PI / 2;
  overviewGroup.add(spine);
}

function createInteriorModule(config: StationModule): void {
  const group = new THREE.Group();
  group.name = `INT_${config.id}`;
  group.position.copy(vector(config.exteriorPosition));
  group.rotation.y = config.interiorRotation;
  group.visible = false;

  const length = config.length * 0.86;
  const width = config.radius * 1.74;
  const height = config.radius * 1.55;

  const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.14, length), interiorFloorMaterial);
  floor.position.y = -height / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, length), interiorWallMaterial);
  ceiling.position.y = height / 2;
  group.add(ceiling);

  for (const x of [-width / 2, width / 2]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.12, height, length), interiorWallMaterial);
    wall.position.x = x;
    group.add(wall);
  }

  for (const z of [-length / 2, length / 2]) {
    const hatch = new THREE.Mesh(
      new THREE.CylinderGeometry(1.48, 1.48, 0.12, 32),
      new THREE.MeshStandardMaterial({ color: 0x425556, roughness: 0.65, metalness: 0.36 }),
    );
    hatch.rotation.x = Math.PI / 2;
    hatch.position.set(0, 0, z);
    group.add(hatch);
  }

  for (let index = -2; index <= 2; index += 1) {
    const cabinet = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, height * 0.68, 1.95),
      new THREE.MeshStandardMaterial({ color: index % 2 === 0 ? 0x4b5f61 : 0x596d6d, roughness: 0.72, metalness: 0.2 }),
    );
    cabinet.position.set(index % 2 === 0 ? -width / 2 + 0.38 : width / 2 - 0.38, -0.05, index * 2.25);
    group.add(cabinet);

    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.35, 0.58), interiorPanelMaterial);
    screen.position.set(index % 2 === 0 ? -width / 2 + 0.08 : width / 2 - 0.08, 0.52, index * 2.25);
    group.add(screen);
  }

  const centerConsole = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.72, 1.35), interiorPanelMaterial);
  centerConsole.position.set(0, -0.98, -1.2);
  group.add(centerConsole);

  const ceilingLight = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.05, 3.1),
    new THREE.MeshStandardMaterial({ color: 0xdcebea, emissive: 0xa5d5d2, emissiveIntensity: 1.5 }),
  );
  ceilingLight.position.set(0, height / 2 - 0.08, 0);
  group.add(ceilingLight);

  const interiorFill = new THREE.HemisphereLight(0xe8fcff, 0x153033, 1.4);
  group.add(interiorFill);
  for (const z of [-length * 0.27, 0, length * 0.27]) {
    const fixture = new THREE.PointLight(0xd8f5f2, 2.6, 8.5, 1.35);
    fixture.position.set(0, height * 0.32, z);
    group.add(fixture);
  }

  interiorRoot.add(group);
  group.updateMatrixWorld(true);
  const localSpawn = new THREE.Vector3(0, 0.6, length / 2 - 3.2);
  const localFocus = new THREE.Vector3(0, 0.5, -1.8);
  const spawnPoint = group.localToWorld(localSpawn.clone());
  const focusPoint = group.localToWorld(localFocus.clone());
  interiorScenes.set(config.id, { group, spawnPoint, focusPoint });
}

function createLabels(): void {
  for (const id of MODULE_IDS) {
    const config = MODULES[id];
    const label = document.createElement("button");
    label.type = "button";
    label.className = "module-label";
    label.dataset.moduleId = id;
    label.dataset.subtitle = config.subtitle;
    label.textContent = config.name;
    label.addEventListener("mouseenter", () => setHoveredModule(id));
    label.addEventListener("mouseleave", () => setHoveredModule(null));
    label.addEventListener("click", () => selectModule(id, true));
    sceneRoot.appendChild(label);
    labels.set(id, label);
  }
}

function setLoadingDetail(text: string): void {
  loadingDetail.textContent = text;
}

function showToast(message: string): void {
  toast.textContent = message;
  toast.classList.add("visible");
  if (toastTimer !== undefined) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2600);
}

function setMode(nextMode: SceneMode): void {
  mode = nextMode;
  modeIndicator.textContent = nextMode === "INTERIOR" ? "舱段内部" : nextMode === "TRANSITION" ? "镜头过渡" : nextMode === "ERROR" ? "场景错误" : "外部总览";
  const isOverview = nextMode === "OVERVIEW";
  const isInterior = nextMode === "INTERIOR";
  gtaoPass.enabled = isOverview;
  topbar.classList.toggle("hidden", isInterior);
  overviewCopy.style.opacity = isOverview ? "1" : "0";
  overviewCopy.style.pointerEvents = isOverview ? "auto" : "none";
  interiorToolbar.classList.toggle("hidden", !isInterior);
  modulePanel.classList.toggle("visible", isOverview && selectedModule !== null);
  controls.enabled = isOverview || isInterior;

  for (const label of labels.values()) {
    label.style.display = isOverview ? "block" : "none";
  }
  for (const sceneData of interiorScenes.values()) {
    sceneData.group.visible = isInterior && sceneData.group === interiorScenes.get(activeInterior ?? "tianhe")?.group;
  }
  overviewGroup.visible = isOverview || nextMode === "TRANSITION";

  if (isOverview) {
    controls.minDistance = 12;
    controls.maxDistance = 140;
  } else if (isInterior) {
    controls.minDistance = 2.2;
    controls.maxDistance = 11;
  }
}

function updatePanel(id: ModuleId | null): void {
  if (!id) {
    selectedModule = null;
    panelTitle.textContent = "未选择舱段";
    panelDescription.textContent = "悬停或点击空间站上的标签。";
    enterButton.disabled = true;
    modulePanel.classList.remove("visible");
    return;
  }
  const config = MODULES[id];
  selectedModule = id;
  panelTitle.textContent = config.name;
  panelDescription.textContent = config.description;
  enterButton.disabled = false;
  modulePanel.classList.add("visible");
}

function setHoveredModule(id: ModuleId | null): void {
  hoveredModule = id;
  for (const [moduleId, label] of labels) {
    label.classList.toggle("active", moduleId === id || moduleId === selectedModule);
  }
  const hotspot = hotspotMeshes.find((mesh) => mesh.userData.moduleId === id);
  for (const mesh of hotspotMeshes) {
    const material = mesh.material as THREE.MeshBasicMaterial;
    material.opacity = mesh === hotspot ? 0.1 : 0;
  }
  if (id && mode === "OVERVIEW") {
    updatePanel(id);
  }
}

function selectModule(id: ModuleId, enterImmediately = false): void {
  if (mode !== "OVERVIEW") return;
  updatePanel(id);
  setHoveredModule(id);
  if (enterImmediately) {
    startEnterTransition(id);
  }
}

function prepareInterior(id: ModuleId): void {
  activeInterior = id;
  overviewGroup.visible = false;
  for (const [moduleId, sceneData] of interiorScenes) {
    sceneData.group.visible = moduleId === id;
  }
  const sceneData = interiorScenes.get(id);
  if (!sceneData) throw new Error(`Missing interior scene for ${id}`);
  camera.position.copy(sceneData.spawnPoint);
  controls.target.copy(sceneData.focusPoint);
  controls.update();
  interiorTitle.textContent = `${MODULES[id].name} · 内部灰盒`;
}

function startEnterTransition(id: ModuleId): void {
  if (mode !== "OVERVIEW") return;
  const config = MODULES[id];
  mode = "TRANSITION";
  setMode("TRANSITION");
  transitionVeil.classList.remove("visible");
  transition = {
    kind: "enter",
    moduleId: id,
    startedAt: performance.now(),
    duration: 1250,
    fromPosition: camera.position.clone(),
    fromTarget: controls.target.clone(),
    toPosition: vector(config.cameraTarget),
    toTarget: vector(config.entryPoint),
    switched: false,
  };
}

function startExitTransition(): void {
  if (mode !== "INTERIOR") return;
  mode = "TRANSITION";
  setMode("TRANSITION");
  transitionVeil.classList.add("visible");
  transition = {
    kind: "exit",
    startedAt: performance.now(),
    duration: 840,
    fromPosition: camera.position.clone(),
    fromTarget: controls.target.clone(),
    toPosition: getOverviewCameraPosition().clone(),
    toTarget: DEFAULT_CAMERA_TARGET.clone(),
    switched: false,
  };
}

function resetScene(): void {
  if (mode === "TRANSITION") return;
  transition = null;
  transitionVeil.classList.remove("visible");
  activeInterior = null;
  for (const sceneData of interiorScenes.values()) sceneData.group.visible = false;
  overviewGroup.visible = true;
  camera.position.copy(getOverviewCameraPosition());
  controls.target.copy(DEFAULT_CAMERA_TARGET);
  controls.minDistance = 12;
  controls.maxDistance = 92;
  controls.update();
  updatePanel(null);
  setHoveredModule(null);
  setMode("OVERVIEW");
  showToast("场景已重置");
}

function easeInOut(value: number): number {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function updateTransition(now: number): void {
  if (!transition) return;
  const rawProgress = Math.min((now - transition.startedAt) / transition.duration, 1);
  const progress = easeInOut(rawProgress);

  if (transition.kind === "enter") {
    if (!transition.switched) {
      camera.position.lerpVectors(transition.fromPosition, transition.toPosition, progress);
      controls.target.lerpVectors(transition.fromTarget, transition.toTarget, progress);
    }
    controls.update();
    if (rawProgress > 0.46 && !transition.switched) {
      transition.switched = true;
      transitionVeil.classList.add("visible");
      if (!transition.moduleId) throw new Error("Transition has no module id.");
      prepareInterior(transition.moduleId);
      setMode("INTERIOR");
    }
    if (rawProgress > 0.74) transitionVeil.classList.remove("visible");
  } else {
    if (rawProgress > 0.18 && !transition.switched) {
      transition.switched = true;
      activeInterior = null;
      for (const sceneData of interiorScenes.values()) sceneData.group.visible = false;
      overviewGroup.visible = true;
    }
    camera.position.lerpVectors(transition.fromPosition, transition.toPosition, progress);
    controls.target.lerpVectors(transition.fromTarget, transition.toTarget, progress);
    controls.update();
  }

  if (rawProgress >= 1) {
    if (transition.kind === "exit") {
      transitionVeil.classList.remove("visible");
      setMode("OVERVIEW");
      activeInterior = null;
      showToast("已返回外部总览");
    } else {
      if (!transition.moduleId) throw new Error("Enter transition has no module id.");
      prepareInterior(transition.moduleId);
      setMode("INTERIOR");
      transitionVeil.classList.remove("visible");
    }
    transition = null;
  }
}

function getHotspotAt(clientX: number, clientY: number): ModuleId | null {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ((clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObjects(hotspotMeshes, false);
  return intersections[0]?.object.userData.moduleId ?? null;
}

function updateLabels(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  for (const id of MODULE_IDS) {
    const label = labels.get(id);
    if (!label) continue;
    const projected = vector(MODULES[id].labelAnchor).project(camera);
    const visible = projected.z < 1 && projected.z > -1;
    label.style.display = mode === "OVERVIEW" && visible ? "block" : "none";
    if (visible) {
      label.style.left = `${(projected.x * 0.5 + 0.5) * width}px`;
      label.style.top = `${(-projected.y * 0.5 + 0.5) * height}px`;
    }
  }
}

function updatePointer(clientX: number, clientY: number): void {
  if (mode !== "OVERVIEW" || transition) return;
  const id = getHotspotAt(clientX, clientY);
  setHoveredModule(id);
  renderer.domElement.style.cursor = id ? "pointer" : "grab";
}

function bindEvents(): void {
  renderer.domElement.addEventListener("pointermove", (event) => updatePointer(event.clientX, event.clientY));
  renderer.domElement.addEventListener("pointerdown", (event) => pointerDown.set(event.clientX, event.clientY));
  renderer.domElement.addEventListener("pointerup", (event) => {
    if (mode !== "OVERVIEW" || transition) return;
    const distance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    if (distance > 6) return;
    const id = getHotspotAt(event.clientX, event.clientY);
    if (id) selectModule(id, true);
  });
  enterButton.addEventListener("click", () => {
    if (selectedModule) startEnterTransition(selectedModule);
  });
  backButton.addEventListener("click", startExitTransition);
  resetButton.addEventListener("click", resetScene);
  window.addEventListener("resize", () => {
    const nextCompactViewport = window.innerWidth <= 700;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = nextCompactViewport ? 53 : 38;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    composer.setSize(window.innerWidth, window.innerHeight);
    if (nextCompactViewport !== compactViewport && mode === "OVERVIEW" && !transition) {
      camera.position.copy(getOverviewCameraPosition());
      controls.target.copy(DEFAULT_CAMERA_TARGET);
      controls.update();
    }
    compactViewport = nextCompactViewport;
  });
}

async function createStation(): Promise<void> {
  addLights();
  addStarfield();
  addEarthHorizon();
  try {
    setLoadingDetail("加载 Blender 外部组合体…");
    await loadBlenderExterior();
  } catch (error) {
    console.warn("Blender exterior asset failed to load; using procedural diagnostic fallback.", error);
    setLoadingDetail("Blender 资产不可用，启用诊断回退…");
    addDockingNode();
    for (const id of MODULE_IDS) {
      createExteriorModule(MODULES[id]);
    }

    addSolarArray(new THREE.Vector3(-21.4, 1.35, -7.2));
    addSolarArray(new THREE.Vector3(-21.4, 1.35, 7.2));
    addSolarArray(new THREE.Vector3(21.4, 1.35, -7.2));
    addSolarArray(new THREE.Vector3(21.4, 1.35, 7.2));
    addSolarArray(new THREE.Vector3(0, 1.55, -12.7), true);
    addSolarArray(new THREE.Vector3(0, 1.55, 12.7), true);
    addArm(new THREE.Vector3(-1.5, 2.2, -0.8), -1);
    addArm(new THREE.Vector3(1.5, 2.2, -0.8), 1);
  }
  for (const id of MODULE_IDS) {
    createInteriorModule(MODULES[id]);
  }
  createLabels();
}

async function initialize(): Promise<void> {
  try {
    setLoadingDetail("建立三舱外部构型…");
    await createStation();
    setLoadingDetail("准备可交互舱段…");
    bindEvents();
    updatePanel(null);
    setMode("OVERVIEW");
    orbitStatus.textContent = "轨道演示 · 12× · 实际周期 92 分钟";
    loadingScreen.classList.add("ready");
    showToast("轨道演示已切换为 12× 可视化速度");
  } catch (error) {
    console.error(error);
    setMode("ERROR");
    loadingScreen.classList.add("ready");
    showToast("场景初始化失败，请刷新页面重试");
  }
}

function updateOrbitalMotion(wallTimeMs: number): void {
  const elapsedSeconds = Math.max(0, wallTimeMs - SIMULATION_EPOCH_MS) / 1000;
  const simulatedSeconds = elapsedSeconds * ORBIT_TIME_SCALE;
  const orbitAngle = THREE.MathUtils.euclideanModulo(simulatedSeconds * ORBIT_ANGULAR_SPEED, Math.PI * 2);
  const earthSpinAngle = THREE.MathUtils.euclideanModulo(simulatedSeconds * EARTH_ANGULAR_SPEED, Math.PI * 2);

  // In this station-following frame the station stays selectable while Earth
  // moves beneath it at the orbital rate minus Earth's own sidereal rotation.
  const groundTrackAngle = orbitAngle - earthSpinAngle;

  if (starfield) starfield.quaternion.setFromAxisAngle(ORBIT_AXIS, -orbitAngle);
  if (sunLight) sunLight.position.copy(SUN_BASE_POSITION).applyAxisAngle(ORBIT_AXIS, -orbitAngle);
  if (earthSurface) earthSurface.rotation.y = EARTH_INITIAL_YAW - groundTrackAngle;
  if (earthNightLayer) earthNightLayer.rotation.y = EARTH_INITIAL_YAW - groundTrackAngle;
  if (earthCloudLayer) earthCloudLayer.rotation.y = EARTH_INITIAL_YAW - groundTrackAngle + simulatedSeconds * 0.000006;

  const phaseDegrees = THREE.MathUtils.radToDeg(orbitAngle);
  orbitStatus.dataset.elapsedSeconds = elapsedSeconds.toFixed(3);
  orbitStatus.dataset.timeScale = ORBIT_TIME_SCALE.toString();
  orbitStatus.dataset.orbitalPeriodSeconds = ORBITAL_PERIOD_SECONDS.toString();
  orbitStatus.dataset.phaseDegrees = phaseDegrees.toFixed(4);
  orbitStatus.textContent = `轨道演示 · ${ORBIT_TIME_SCALE}× · 相位 ${phaseDegrees.toFixed(1).padStart(5, "0")}°`;
}

function animate(now: number): void {
  requestAnimationFrame(animate);
  if (transition) updateTransition(now);
  if (mode === "OVERVIEW" || mode === "INTERIOR") controls.update();
  updateOrbitalMotion(Date.now());
  updateLabels();
  composer.render();
}

void initialize();
requestAnimationFrame(animate);
