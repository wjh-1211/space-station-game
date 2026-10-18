import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { MODULES, MODULE_IDS, type ModuleId, vector } from "./data/stationModules";
import { EXTERIOR_ASSET_MANIFEST } from "./data/exteriorAssetManifest";
import "./styles.css";

type SceneMode = "LOADING" | "OVERVIEW" | "ERROR";

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
const modeIndicator = document.querySelector<HTMLDivElement>("#mode-indicator")!;
const modulePanel = document.querySelector<HTMLElement>("#module-panel")!;
const panelTitle = document.querySelector<HTMLElement>("#panel-title")!;
const panelDescription = document.querySelector<HTMLElement>("#panel-description")!;
const toast = document.querySelector<HTMLDivElement>("#toast")!;
const orbitStatus = document.querySelector<HTMLDivElement>("#orbit-status")!;

if (
  !sceneRoot ||
  !loadingScreen ||
  !loadingDetail ||
  !modeIndicator ||
  !modulePanel ||
  !panelTitle ||
  !panelDescription ||
  !toast ||
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

const hotspotMeshes: THREE.Mesh[] = [];
const labels = new Map<ModuleId, HTMLButtonElement>();
const gltfLoader = new GLTFLoader();

let mode: SceneMode = "LOADING";
let selectedModule: ModuleId | null = null;
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
  gltf.scene.name = "Blender_Station_Exterior";
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
    label.addEventListener("click", () => selectModule(id));
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
  modeIndicator.textContent = nextMode === "ERROR" ? "场景错误" : "外部总览";
  modulePanel.classList.toggle("visible", nextMode === "OVERVIEW" && selectedModule !== null);
}

function updatePanel(id: ModuleId | null): void {
  if (!id) {
    selectedModule = null;
    panelTitle.textContent = "未选择舱段";
    panelDescription.textContent = "悬停或点击空间站上的标签。";
    modulePanel.classList.remove("visible");
    return;
  }
  const config = MODULES[id];
  selectedModule = id;
  panelTitle.textContent = config.name;
  panelDescription.textContent = config.description;
  modulePanel.classList.add("visible");
}

function setHoveredModule(id: ModuleId | null): void {
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

function selectModule(id: ModuleId): void {
  if (mode !== "OVERVIEW") return;
  updatePanel(id);
  setHoveredModule(id);
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
    const label = labels.get(id)!;
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
  if (mode !== "OVERVIEW") return;
  const id = getHotspotAt(clientX, clientY);
  setHoveredModule(id);
  renderer.domElement.style.cursor = id ? "pointer" : "grab";
}

function bindEvents(): void {
  renderer.domElement.addEventListener("pointermove", (event) => updatePointer(event.clientX, event.clientY));
  renderer.domElement.addEventListener("pointerdown", (event) => pointerDown.set(event.clientX, event.clientY));
  renderer.domElement.addEventListener("pointerup", (event) => {
    if (mode !== "OVERVIEW") return;
    const distance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    if (distance > 6) return;
    const id = getHotspotAt(event.clientX, event.clientY);
    if (id) selectModule(id);
  });
  window.addEventListener("resize", () => {
    const nextCompactViewport = window.innerWidth <= 700;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = nextCompactViewport ? 53 : 38;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    composer.setSize(window.innerWidth, window.innerHeight);
    if (nextCompactViewport !== compactViewport && mode === "OVERVIEW") {
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
  setLoadingDetail("加载 Blender 外部组合体...");
  await loadBlenderExterior();
  createLabels();
}

async function initialize(): Promise<void> {
  try {
    setLoadingDetail("建立三舱外部构型...");
    await createStation();
    setLoadingDetail("准备舱段标注...");
    bindEvents();
    updatePanel(null);
    setMode("OVERVIEW");
    orbitStatus.textContent = "轨道演示 · 12× · 实际周期 92 分钟";
    loadingScreen.classList.add("ready");
    showToast("轨道演示已切换为 12× 可视化速度");
    requestAnimationFrame(animate);
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

function animate(): void {
  requestAnimationFrame(animate);
  controls.update();
  updateOrbitalMotion(Date.now());
  updateLabels();
  composer.render();
}

void initialize();
