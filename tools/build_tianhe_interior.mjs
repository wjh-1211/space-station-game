import fs from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

globalThis.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
};

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(rootDir, "public", "models", "tianhe-interior.glb");
const texturePath = path.join(rootDir, "public", "textures", "tianhe", "surface-detail.png");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.concat([typeBuffer, data]);
  const header = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(chunk));
  return Buffer.concat([header, chunk, checksum]);
}

async function writeSurfaceTexture() {
  const size = 256;
  const pixels = Buffer.alloc((size + 1) * size);
  for (let y = 0; y < size; y += 1) {
    pixels[y * (size + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      const hash = Math.sin(x * 91.73 + y * 37.19) * 43758.5453;
      const noise = hash - Math.floor(hash);
      const weave = Math.sin(x * 0.72) * 1.4 + Math.sin(y * 0.68) * 1.4;
      const sheetVariation = Math.sin(x * 0.047 + y * 0.016) * 3 + Math.sin(y * 0.063) * 2;
      const fiber = x % 32 === 0 || y % 32 === 0 ? -3 : 0;
      pixels[y * (size + 1) + x + 1] = Math.max(0, Math.min(255, Math.round(238 + noise * 7 + weave + sheetVariation + fiber)));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(pixels, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  await fs.mkdir(path.dirname(texturePath), { recursive: true });
  await fs.writeFile(texturePath, png);
}

const scene = new THREE.Scene();
scene.name = "Tianhe_Interior";
const visibleRoot = new THREE.Group();
visibleRoot.name = "VIS_Tianhe_Interior";
const collisionRoot = new THREE.Group();
collisionRoot.name = "COL_Tianhe_Interior";
scene.add(visibleRoot, collisionRoot);

function material(name, color, roughness = 0.72, metalness = 0.08, emissive = 0x000000, emissiveIntensity = 0) {
  const result = new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity });
  result.name = name;
  return result;
}

const MAT = {
  panel: material("Cabin Matte White", 0xe9edea, 0.91, 0.015),
  panelCool: material("Cabin Cool White", 0xe4eae9, 0.87, 0.025),
  panelWarm: material("Insulated Warm White", 0xebece8, 0.95, 0.005),
  panelInset: material("Panel Recess", 0xcdd4d2, 0.81, 0.06),
  seam: material("Panel Seam Backing", 0x848f90, 0.85, 0.06),
  softWhite: material("Quilted Insulation Fabric", 0xf4f4ef, 0.98, 0),
  metal: material("Brushed Handrail Metal", 0xaeb8b6, 0.3, 0.78),
  dark: material("Equipment Charcoal", 0x343b3d, 0.58, 0.28),
  equipmentGray: material("Equipment Housing Gray", 0x7f8988, 0.52, 0.34),
  blue: material("Tianhe Blue Grip", 0x496987, 0.88, 0.02),
  blueSoft: material("Blue Restraint Textile", 0x597799, 0.98, 0.005),
  screen: material("Control Screen", 0x28434b, 0.57, 0.04, 0x38717d, 0.38),
  light: material("Cabin Light Diffuser", 0xf7f9f6, 0.72, 0, 0xf4f7ef, 1.25),
  indicator: material("Indicator Glow", 0xb4dfd2, 0.7, 0, 0x70c3b0, 0.55),
  stencil: material("Equipment Stencil", 0x596c70, 0.98, 0),
  red: material("Safety Red", 0xb72d31, 0.7, 0.04),
  yellow: material("Marking Yellow", 0xe1b633, 0.6, 0.08),
  black: material("Optical Black", 0x111516, 0.38, 0.3),
  glass: material("Optical Coated Glass", 0x172c38, 0.18, 0.62, 0x0b2535, 0.2),
  sleep: material("Sleep Bag Fabric", 0xf2f2ed, 0.98, 0),
  collision: new THREE.MeshBasicMaterial({ color: 0xff00ff }),
};
MAT.collision.name = "Collision Debug";

function roundedBox(name, size, position, mat, parent = visibleRoot, rotation = [0, 0, 0], radius = 0.012) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(size[0], size[1], size[2], 4, radius), mat);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function box(name, size, position, mat = MAT.panel, parent = visibleRoot, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function collisionBox(name, size, position, rotation = [0, 0, 0]) {
  const collider = box(`COL_${name}`, size, position, MAT.collision, collisionRoot, rotation);
  collider.visible = false;
  return collider;
}

function cylinder(name, radius, length, position, mat, rotation = [Math.PI / 2, 0, 0], parent = visibleRoot, segments = 24) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), mat);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinderBetween(name, from, to, radius, mat, parent = visibleRoot) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 18), mat);
  mesh.name = name;
  mesh.position.copy(start.add(end).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function torus(name, majorRadius, tubeRadius, position, mat, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(majorRadius, tubeRadius, 12, 64), mat);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  visibleRoot.add(mesh);
  return mesh;
}

function cable(name, points, radius = 0.018, mat = MAT.dark) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, radius, 8, false), mat);
  mesh.name = name;
  mesh.castShadow = true;
  visibleRoot.add(mesh);
  return mesh;
}

function addPanelHardware(prefix, wallX, y, z, inward) {
  for (const offsetZ of [-0.38, 0.38]) {
    cylinder(
      `${prefix}_Fastener_${offsetZ}`,
      0.018,
      0.025,
      [wallX + inward * 0.075, y, z + offsetZ],
      MAT.metal,
      [0, 0, Math.PI / 2],
      visibleRoot,
      12,
    );
  }
  roundedBox(`${prefix}_Handle`, [0.035, 0.045, 0.26], [wallX + inward * 0.078, y - 0.22, z + 0.25], MAT.metal, visibleRoot, [0, 0, 0], 0.012);
}

const segmentCenters = Array.from({ length: 10 }, (_, index) => -6.0 + index * 1.34);

box("VIS_HullBacking_Port", [0.04, 2.92, 13.76], [-1.685, 0, 0], MAT.panelInset);
box("VIS_HullBacking_Starboard", [0.04, 2.92, 13.76], [1.685, 0, 0], MAT.panelInset);
box("VIS_HullBacking_Deck", [3.32, 0.04, 13.76], [0, -1.485, 0], MAT.panelInset);
box("VIS_HullBacking_Ceiling", [3.32, 0.04, 13.76], [0, 1.485, 0], MAT.panelInset);

for (const [index, z] of segmentCenters.entries()) {
  for (const side of [-1, 1]) {
    const wallX = side * 1.67;
    for (const y of [-0.83, 0.0, 0.83]) {
      const panelMaterial = index % 4 === 0 ? MAT.panelWarm : index % 3 === 0 ? MAT.panelCool : MAT.panel;
      const panel = roundedBox(`VIS_SidePanel_${side}_${index}_${y}`, [0.12, 0.72, 1.22], [wallX, y, z], panelMaterial);
      panel.rotation.y = side > 0 ? 0 : Math.PI;
      addPanelHardware(`VIS_SidePanel_${side}_${index}_${y}`, wallX, y, z, -side);
      if (y === 0 && index % 3 === 1) {
        // Recessed inspection covers interrupt the otherwise continuous equipment skin.
        box(`VIS_ServiceFrame_${side}_${index}`, [0.014, 0.37, 0.46], [wallX - side * 0.067, -0.015, z - 0.15], MAT.seam);
        box(`VIS_ServiceCover_${side}_${index}`, [0.018, 0.34, 0.43], [wallX - side * 0.079, -0.015, z - 0.15], MAT.panelCool);
        for (const offsetY of [-0.11, 0.11]) {
          box(`VIS_ServiceLatch_${side}_${index}_${offsetY}`, [0.02, 0.025, 0.08], [wallX - side * 0.091, offsetY, z + 0.01], MAT.metal);
        }
      }
      if ((index + Math.round((y + 0.83) * 10)) % 3 === 0) {
        box(`VIS_PanelLabel_${side}_${index}_${y}`, [0.018, 0.07, 0.18], [wallX - side * 0.071, y + 0.22, z - 0.28], MAT.blueSoft);
        box(`VIS_PanelCode_${side}_${index}_${y}`, [0.019, 0.035, 0.1], [wallX - side * 0.072, y + 0.12, z - 0.28], MAT.dark);
      }
    }
  }

  for (const y of [-1.47, 1.47]) {
    for (const x of [-1.08, -0.36, 0.36, 1.08]) {
      roundedBox(`VIS_DeckPanel_${y}_${index}_${x}`, [0.66, 0.055, 1.285], [x, y, z], y > 0 ? MAT.panel : MAT.panelWarm, visibleRoot, [0, 0, 0], 0.006);
      if (y < 0 && Math.abs(x) === 1.08 && index % 2 === 0) {
        box(`VIS_DeckTie_${index}_${x}`, [0.025, 0.006, 0.22], [x, -1.512, z + 0.32], MAT.blueSoft);
      }
      if (y < 0 && Math.abs(x) === 0.36 && index % 3 === 1) {
        box(`VIS_DeckRelease_${index}_${x}`, [0.065, 0.007, 0.12], [x, -1.515, z - 0.36], MAT.stencil);
        box(`VIS_DeckReleaseSlot_${index}_${x}`, [0.04, 0.009, 0.018], [x, -1.521, z - 0.36], MAT.metal);
      }
    }
  }

  for (const sideX of [-1, 1]) {
    for (const sideY of [-1, 1]) {
      roundedBox(
        `VIS_CornerPanel_${sideX}_${sideY}_${index}`,
        [0.1, 0.48, 1.22],
        [sideX * 1.47, sideY * 1.26, z],
        MAT.panelCool,
        visibleRoot,
        [0, 0, sideX * sideY * Math.PI / 4],
        0.008,
      );
    }
  }
}

function addRail(name, x, y, zStart, zEnd) {
  const rail = cylinderBetween(`INTERACT_Handrail_${name}`, [x, y, zStart], [x, y, zEnd], 0.035, MAT.blue);
  rail.userData.interaction = "handrail";
  for (const z of [zStart, (zStart + zEnd) / 2, zEnd]) {
    cylinderBetween(`VIS_RailBracket_${name}_${z}`, [x, y, z], [x + Math.sign(x || 1) * 0.13, y, z], 0.022, MAT.metal);
  }
  const centerZ = (zStart + zEnd) / 2;
  collisionBox(`Handrail_${name}`, [0.09, 0.09, zEnd - zStart + 0.08], [x, y, centerZ]);
}

for (const [index, z] of segmentCenters.entries()) {
  const start = z - 0.39;
  const end = z + 0.39;
  if ([0, 2, 5, 7, 9].includes(index)) addRail(`Port_Upper_${index}`, -1.42, 0.84, start, end);
  if ([1, 3, 6, 8].includes(index)) addRail(`Starboard_Upper_${index}`, 1.42, 0.84, start, end);
  if ([1, 5, 8].includes(index)) addRail(`Port_Lower_${index}`, -1.42, -0.84, start, end);
  if ([2, 6, 9].includes(index)) addRail(`Starboard_Lower_${index}`, 1.42, -0.84, start, end);
  if ([1, 5, 8].includes(index)) addRail(`Ceiling_Port_${index}`, -0.72, 1.35, start, end);
  if ([3, 6, 9].includes(index)) addRail(`Ceiling_Starboard_${index}`, 0.72, 1.35, start, end);
}

for (const z of [-5.45, -3.2, -0.95, 1.3, 3.55, 5.45]) {
  for (const x of [-0.82, 0.82]) {
    box(`VIS_LightFrame_${x}_${z}`, [0.18, 0.025, 0.98], [x, 1.413, z], MAT.metal);
    roundedBox(`LIGHT_FIXTURE_${x}_${z}`, [0.14, 0.026, 0.91], [x, 1.397, z], MAT.light, visibleRoot, [0, 0, 0], 0.006);
  }
}

// The reference footage shows small grab loops and cable runs mounted on the
// ceiling covers, rather than a second row of large glowing panels.
for (const [index, z] of segmentCenters.entries()) {
  for (const x of [-0.38, 0.38]) {
    if (index % 3 === 0 && x > 0) continue;
    const handleZ = z + (index % 2 ? 0.12 : -0.12);
    cylinderBetween(`VIS_CeilingLoop_${index}_${x}_A`, [x - 0.105, 1.39, handleZ - 0.08], [x - 0.105, 1.31, handleZ], 0.012, MAT.metal);
    cylinderBetween(`VIS_CeilingLoop_${index}_${x}_B`, [x + 0.105, 1.39, handleZ - 0.08], [x + 0.105, 1.31, handleZ], 0.012, MAT.metal);
    cylinderBetween(`VIS_CeilingLoop_${index}_${x}_Grip`, [x - 0.105, 1.31, handleZ], [x + 0.105, 1.31, handleZ], 0.014, MAT.metal);
  }
}

function addEquipmentRack(side, z, variant) {
  const x = side * 1.47;
  const faceX = x - side * 0.175;
  const rack = roundedBox(`VIS_EquipmentRack_${side}_${z}`, [0.32, 1.08, 1.08], [x, -0.05, z], variant % 2 ? MAT.panelWarm : MAT.panel, visibleRoot, [0, 0, 0], 0.012);
  rack.userData.source = "video-00:13-00:21";
  box(`VIS_RackRecess_${side}_${z}`, [0.025, 0.24, 0.34], [faceX, 0.17, z - 0.17], MAT.dark);
  box(`VIS_RackLabel_${side}_${z}`, [0.027, 0.1, 0.28], [faceX - side * 0.002, 0.4, z + 0.24], variant % 2 ? MAT.blue : MAT.panelInset);
  for (let index = 0; index < 6; index += 1) {
    cylinder(`VIS_RackControl_${side}_${z}_${index}`, 0.018, 0.018, [faceX - side * 0.02, -0.3 + (index % 3) * 0.13, z - 0.22 + Math.floor(index / 3) * 0.18], index === 0 ? MAT.red : MAT.metal, [0, 0, Math.PI / 2], visibleRoot, 12);
  }
  for (let index = 0; index < 5; index += 1) {
    box(`VIS_RackVent_${side}_${z}_${index}`, [0.028, 0.022, 0.32], [faceX - side * 0.021, -0.38 + index * 0.055, z + 0.24], MAT.seam);
  }
  for (const offset of [-0.31, 0.31]) {
    box(`VIS_RackSerial_${side}_${z}_${offset}`, [0.02, 0.014, 0.14], [faceX - side * 0.025, 0.39, z + offset], MAT.stencil);
  }
  box(`VIS_RackIndicatorHousing_${side}_${z}`, [0.028, 0.09, 0.21], [faceX - side * 0.026, 0.18, z - 0.17], MAT.equipmentGray);
  for (const offset of [-0.065, 0, 0.065]) {
    box(`VIS_RackIndicator_${side}_${z}_${offset}`, [0.031, 0.014, 0.035], [faceX - side * 0.045, 0.18, z - 0.17 + offset], MAT.indicator);
  }
  if (variant % 3 === 0) {
    box(`VIS_RackCablePort_${side}_${z}`, [0.03, 0.19, 0.27], [faceX - side * 0.03, -0.11, z - 0.28], MAT.equipmentGray);
    for (const offset of [-0.08, 0, 0.08]) {
      cylinder(`VIS_RackPort_${side}_${z}_${offset}`, 0.026, 0.028,
        [faceX - side * 0.055, -0.1, z - 0.28 + offset], MAT.black,
        [0, 0, Math.PI / 2], visibleRoot, 16);
    }
  } else if (variant % 3 === 1) {
    box(`VIS_RackInstrument_${side}_${z}`, [0.026, 0.28, 0.45], [faceX - side * 0.03, 0.04, z - 0.15], MAT.panelInset);
    for (let slot = 0; slot < 4; slot += 1) {
      box(`VIS_RackInstrumentSlot_${side}_${z}_${slot}`, [0.031, 0.025, 0.34],
        [faceX - side * 0.049, -0.04 + slot * 0.057, z - 0.15], MAT.stencil);
    }
  } else {
    for (const offset of [-0.16, 0.16]) {
      roundedBox(`VIS_RackModule_${side}_${z}_${offset}`, [0.065, 0.28, 0.22],
        [faceX - side * 0.045, 0.07, z + offset], MAT.equipmentGray, visibleRoot, [0, 0, 0], 0.008);
    }
  }
  roundedBox(`VIS_RackPull_${side}_${z}`, [0.04, 0.3, 0.04], [faceX - side * 0.045, -0.02, z + 0.39], MAT.metal, visibleRoot, [0, 0, 0], 0.012);
  collisionBox(`EquipmentRack_${side}_${z}`, [0.48, 1.1, 1.1], [side * 1.43, -0.05, z]);
}

addEquipmentRack(-1, 3.7, 0);
addEquipmentRack(1, 2.85, 1);
addEquipmentRack(-1, 1.25, 2);
addEquipmentRack(1, -1.55, 3);
addEquipmentRack(-1, -3.1, 4);
addEquipmentRack(1, -3.8, 5);

function addConnectorBank(side, z, y) {
  const faceX = side * 1.595;
  roundedBox(`VIS_ConnectorBackplate_${side}_${z}`, [0.035, 0.46, 0.62], [faceX, y, z], MAT.panelInset, visibleRoot, [0, 0, 0], 0.018);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const connectorY = y - 0.14 + row * 0.14;
      const connectorZ = z - 0.2 + column * 0.135;
      cylinder(`VIS_Connector_${side}_${z}_${row}_${column}`, 0.027, 0.032, [faceX - side * 0.03, connectorY, connectorZ], column === 0 ? MAT.blue : MAT.metal, [0, 0, Math.PI / 2], visibleRoot, 14);
    }
  }
}

addConnectorBank(-1, 0.32, 0.36);
addConnectorBank(-1, -1.8, 0.34);
addConnectorBank(1, 2.7, -0.3);

for (const [side, z, y] of [[-1, 3.05, 0.35], [1, 0.2, 0.35], [-1, -3.65, 0.42]]) {
  const x = side * 1.565;
  box(`VIS_ServiceInterface_${side}_${z}`, [0.033, 0.56, 0.67], [x, y, z], MAT.panelCool);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      const connectorY = y - 0.19 + row * 0.12;
      const connectorZ = z - 0.25 + column * 0.12;
      cylinder(`VIS_ServiceSocket_${side}_${z}_${row}_${column}`, 0.017, 0.018,
        [x - side * 0.025, connectorY, connectorZ], row === 3 ? MAT.blue : MAT.equipmentGray,
        [0, 0, Math.PI / 2], visibleRoot, 12);
    }
  }
  cable(`VIS_ServiceCable_${side}_${z}`, [
    [x - side * 0.03, y - 0.19, z - 0.25],
    [x - side * 0.14, y - 0.32, z - 0.11],
    [x - side * 0.11, y - 0.23, z + 0.32],
  ], 0.009, MAT.dark);
}

const openBay = roundedBox("VIS_OpenEquipmentBay", [0.38, 0.92, 1.22], [-1.45, 0.05, -1.85], MAT.equipmentGray, visibleRoot, [0, 0, 0], 0.035);
openBay.userData.source = "video-00:13-00:21";
box("VIS_OpenEquipmentBayVoid", [0.08, 0.68, 0.94], [-1.27, 0.06, -1.85], MAT.dark);
for (let index = 0; index < 7; index += 1) {
  box(`VIS_OpenBayBus_${index}`, [0.04, 0.025, 0.72], [-1.223, 0.31 - index * 0.09, -1.85], index % 2 ? MAT.metal : MAT.equipmentGray);
}
for (let index = 0; index < 4; index += 1) {
  cylinderBetween(`VIS_OpenBayCanister_${index}`, [-1.2, -0.22 + index * 0.16, -2.15], [-1.2, -0.22 + index * 0.16, -1.65], 0.045, index % 2 ? MAT.metal : MAT.equipmentGray);
}
for (let index = 0; index < 5; index += 1) {
  cable(`VIS_OpenBayWire_${index}`, [
    [-1.22, -0.24 + index * 0.12, -2.15],
    [-1.14, -0.18 + index * 0.11, -1.9],
    [-1.23, -0.15 + index * 0.1, -1.62],
  ], 0.009, index === 1 ? MAT.red : index === 3 ? MAT.blue : MAT.dark);
}
collisionBox("OpenEquipmentBay", [0.42, 0.96, 1.26], [-1.45, 0.05, -1.85]);

const lightingPanel = roundedBox("INTERACT_Tianhe_Lighting", [0.22, 0.72, 0.92], [1.43, 0.12, 1.1], MAT.panelWarm, visibleRoot, [0, 0, 0], 0.035);
lightingPanel.userData.interaction = "lighting";
lightingPanel.userData.label = "情景照明";
box("VIS_LightingScreen", [0.025, 0.2, 0.38], [1.305, 0.25, 1.1], MAT.screen);
for (const [index, z] of [0.98, 1.08, 1.18].entries()) {
  box(`VIS_LightingReadout_${index}`, [0.027, 0.014, 0.068], [1.29, 0.28 - index * 0.055, z], MAT.indicator);
}
for (const y of [-0.12, 0.02]) {
  for (const z of [0.88, 1.05, 1.22, 1.39]) {
    cylinder("VIS_LightingButton", 0.025, 0.018, [1.29, y, z], y < 0 ? MAT.blue : MAT.metal, [0, 0, Math.PI / 2], visibleRoot, 12);
  }
}
collisionBox("LightingPanel", [0.24, 0.74, 0.94], [1.43, 0.12, 1.1]);

const communicationPanel = roundedBox("INTERACT_Tianhe_Communication", [0.22, 0.78, 0.96], [-1.43, 0.28, 2.35], MAT.panelWarm, visibleRoot, [0, 0, 0], 0.035);
communicationPanel.userData.interaction = "communication";
communicationPanel.userData.label = "天地通信终端";
box("VIS_CommunicationScreen", [0.025, 0.32, 0.48], [-1.305, 0.4, 2.35], MAT.screen);
for (let index = 0; index < 4; index += 1) {
  box(`VIS_CommunicationReadout_${index}`, [0.028, 0.016, 0.29 - index * 0.04], [-1.287, 0.5 - index * 0.055, 2.35], index === 0 ? MAT.indicator : MAT.stencil);
}
for (const z of [2.08, 2.26, 2.44, 2.62]) {
  cylinder("VIS_CommunicationControl", 0.027, 0.018, [-1.29, -0.02, z], MAT.metal, [0, 0, Math.PI / 2], visibleRoot, 12);
}
collisionBox("CommunicationPanel", [0.24, 0.8, 0.98], [-1.43, 0.28, 2.35]);

const diningTable = roundedBox("INTERACT_Tianhe_DiningTable", [0.52, 0.1, 0.92], [1.24, -0.62, -2.35], MAT.panelWarm, visibleRoot, [0, 0, -0.12], 0.055);
diningTable.userData.interaction = "dining";
diningTable.userData.label = "折叠就餐台";
box("VIS_DiningTableStrap", [0.56, 0.12, 0.1], [1.22, -0.56, -2.35], MAT.blueSoft, visibleRoot, [0, 0, -0.12]);
cylinderBetween("VIS_DiningTableHinge", [1.48, -0.83, -2.76], [1.48, -0.83, -1.94], 0.035, MAT.metal);
collisionBox("DiningTable", [0.72, 0.58, 1.02], [1.17, -0.62, -2.35], [0, 0, -0.12]);

const exerciseHandle = cylinderBetween("INTERACT_Tianhe_Exercise", [-1.25, -0.55, -4.18], [-0.82, -0.55, -4.18], 0.055, MAT.blue);
exerciseHandle.userData.interaction = "exercise";
exerciseHandle.userData.label = "抗阻训练器";
cable("VIS_ExerciseCable_Port", [[-1.25, -0.55, -4.18], [-1.48, -0.4, -4.35], [-1.5, 0.2, -4.45]], 0.026, MAT.dark);
cable("VIS_ExerciseCable_Starboard", [[-0.82, -0.55, -4.18], [-0.72, -0.72, -4.38], [-0.58, -1.08, -4.5]], 0.026, MAT.dark);
collisionBox("ExerciseHandle", [0.54, 0.14, 0.14], [-1.035, -0.55, -4.18]);

const cameraBody = roundedBox("VIS_LargeCameraBody", [0.82, 0.58, 0.76], [-1.14, 0.18, -0.72], MAT.dark, visibleRoot, [0, 0.12, 0], 0.09);
cameraBody.userData.source = "video-00:19-00:21";
cylinder("VIS_LargeCameraLens", 0.22, 0.5, [-0.72, 0.2, -0.8], MAT.black, [0, 0, Math.PI / 2]);
cylinder("VIS_LargeCameraLensRing", 0.26, 0.08, [-0.46, 0.2, -0.8], MAT.metal, [0, 0, Math.PI / 2]);
for (const [index, radius] of [0.17, 0.12, 0.067].entries()) {
  cylinder(`VIS_LargeCameraOptic_${index}`, radius, 0.006, [-0.414 - index * 0.005, 0.2, -0.8], index === 0 ? MAT.glass : MAT.black, [0, 0, Math.PI / 2], visibleRoot, 32);
}
roundedBox("VIS_CameraShoulder", [0.63, 0.13, 0.55], [-1.2, 0.52, -0.74], MAT.equipmentGray, visibleRoot, [0, 0.12, 0], 0.018);
cylinderBetween("VIS_CameraTopHandle", [-1.38, 0.64, -0.74], [-1.05, 0.64, -0.74], 0.026, MAT.black);
for (const z of [-0.98, -0.88, -0.78]) {
  box(`VIS_CameraSideControl_${z}`, [0.016, 0.034, 0.055], [-1.557, 0.12, z], MAT.metal);
}
roundedBox("VIS_CameraMonitor", [0.08, 0.38, 0.48], [-1.05, 0.56, -0.62], MAT.screen, visibleRoot, [0, 0.18, 0], 0.025);
cylinderBetween("VIS_CameraSupport", [-1.28, -0.15, -0.72], [-1.48, -0.8, -0.55], 0.045, MAT.metal);
collisionBox("LargeCamera", [1.26, 0.78, 0.92], [-1.04, 0.18, -0.72]);

cable("VIS_Cable_Port_1", [[-1.54, 1.1, 4.8], [-1.5, 1.22, 2.4], [-1.54, 1.12, 0.2], [-1.46, 1.18, -2.8]], 0.014);
cable("VIS_Cable_Port_2", [[-1.53, 1.02, 4.5], [-1.48, 1.08, 2.1], [-1.54, 0.98, -0.4], [-1.46, 1.02, -3.4]], 0.011, MAT.blue);
cable("VIS_Cable_Starboard_1", [[1.54, 1.16, 3.9], [1.5, 1.2, 1.7], [1.53, 1.08, -0.8], [1.48, 1.16, -3.7]], 0.012);
cable("VIS_Cable_Ceiling", [[-0.62, 1.43, 3.7], [-0.56, 1.41, 2.5], [-0.62, 1.42, 1.3], [-0.55, 1.4, -0.2]], 0.01);
cable("VIS_CameraCable", [[-1.2, 0.44, -0.7], [-1.5, 0.7, -0.3], [-1.52, 1.0, 0.8]], 0.022);
for (const [index, z] of [-3.25, -2.95, -2.65].entries()) {
  cable(`VIS_PortCableLoop_${index}`, [
    [-1.57, 0.61, z - 0.22], [-1.36, 0.62, z - 0.09],
    [-1.35, 0.42, z + 0.13], [-1.56, 0.43, z + 0.27],
  ], 0.008, index === 1 ? MAT.blue : MAT.dark);
}

for (const z of [-4.9, -2.6, -0.3, 2.0, 4.3]) {
  for (const side of [-1, 1]) {
    roundedBox(`VIS_CableClamp_${side}_${z}`, [0.055, 0.12, 0.08], [side * 1.55, 1.13, z], MAT.metal, visibleRoot, [0, 0, 0], 0.012);
  }
}

const overheadUnit = roundedBox("VIS_OverheadBlueElectronics", [0.7, 0.22, 0.42], [-0.72, 1.25, 2.5], MAT.blue, visibleRoot, [0, 0, 0], 0.025);
overheadUnit.userData.source = "video-00:13-00:18";
for (const x of [-0.93, -0.78, -0.63, -0.48]) {
  cylinder(`VIS_OverheadConnector_${x}`, 0.022, 0.025, [x, 1.12, 2.32], MAT.metal, [0, 0, 0], visibleRoot, 12);
}

cylinder("VIS_FireExtinguisherBody", 0.14, 0.54, [-1.38, -0.2, 0.48], MAT.red, [0, 0, 0], visibleRoot, 24);
cylinder("VIS_FireExtinguisherCap", 0.08, 0.12, [-1.38, 0.13, 0.48], MAT.metal, [0, 0, 0], visibleRoot, 18);
cable("VIS_FireExtinguisherHose", [[-1.38, 0.16, 0.48], [-1.2, 0.32, 0.46], [-1.28, 0.46, 0.3]], 0.016, MAT.dark);
collisionBox("FireExtinguisher", [0.34, 0.78, 0.34], [-1.38, -0.14, 0.48]);

roundedBox("VIS_PhotoFrame", [0.035, 0.34, 0.44], [-1.59, -0.05, 1.92], MAT.metal, visibleRoot, [0, 0, 0], 0.015);
box("VIS_PhotoField", [0.02, 0.27, 0.37], [-1.61, -0.05, 1.92], MAT.dark);
box("VIS_PhotoEarth", [0.018, 0.11, 0.18], [-1.623, -0.08, 1.84], MAT.blue);
box("VIS_PhotoCrew", [0.018, 0.08, 0.12], [-1.624, 0.06, 2.04], MAT.panelWarm);

function addQuiltedEndWall(prefix, z, inward) {
  for (const x of [-1.32, -0.88, -0.44, 0, 0.44, 0.88, 1.32]) {
    for (const y of [-1.15, -0.72, -0.29, 0.14, 0.57, 1.0]) {
      if (Math.hypot(x, y) < 1.02) continue;
      roundedBox(`VIS_${prefix}_Quilt_${x}_${y}`, [0.39, 0.36, 0.065], [x, y, z + inward * 0.105], MAT.softWhite, visibleRoot, [0, 0, (Math.round((x + y) * 10) % 2) * 0.025], 0.055);
      cylinder(`VIS_${prefix}_QuiltFastener_${x}_${y}`, 0.012, 0.012, [x, y, z + inward * 0.145], MAT.metal, [Math.PI / 2, 0, 0], visibleRoot, 10);
      cylinderBetween(`VIS_${prefix}_QuiltSeam_${x}_${y}`,
        [x - 0.16, y - 0.15, z + inward * 0.141],
        [x + 0.16, y + 0.15, z + inward * 0.141], 0.0025, MAT.panelInset);
    }
  }
}

function addHatch(prefix, z, inward) {
  const faceZ = z + inward * 0.04;
  roundedBox(`VIS_${prefix}_EndWall`, [3.28, 2.9, 0.12], [0, 0, z], MAT.panelWarm, visibleRoot, [0, 0, 0], 0.12);
  addQuiltedEndWall(prefix, z, inward);
  cylinder(`VIS_${prefix}_HatchLeaf`, 0.88, 0.11, [0, 0, faceZ], MAT.panel, [Math.PI / 2, 0, 0], visibleRoot, 64);
  torus(`VIS_${prefix}_HatchSeal`, 0.91, 0.07, [0, 0, faceZ + inward * 0.07], MAT.metal);
  torus(`VIS_${prefix}_HatchGrip`, 0.55, 0.026, [0, 0, faceZ + inward * 0.145], MAT.metal);
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    cylinderBetween(
      `VIS_${prefix}_HatchSpoke_${index}`,
      [Math.cos(angle) * 0.12, Math.sin(angle) * 0.12, faceZ + inward * 0.15],
      [Math.cos(angle) * 0.52, Math.sin(angle) * 0.52, faceZ + inward * 0.15],
      0.018,
      MAT.metal,
    );
  }
  cylinder(`VIS_${prefix}_HatchHub`, 0.12, 0.08, [0, 0, faceZ + inward * 0.17], MAT.dark, [Math.PI / 2, 0, 0]);
  collisionBox(`${prefix}_EndWall`, [3.42, 3.04, 0.18], [0, 0, z]);
}

addHatch("Forward", 6.92, -1);
addHatch("Aft", -6.92, 1);

function addSleepBag(name, position, rotation, interactive = false) {
  const bag = roundedBox(name, [0.72, 1.12, 0.32], position, MAT.sleep, visibleRoot, rotation, 0.16);
  bag.userData.source = "video-00:22-00:26";
  if (interactive) {
    bag.userData.interaction = "sleep";
    bag.userData.label = "睡眠区";
  }
  box(`${name}_CenterSeam`, [0.035, 0.84, 0.34], [position[0], position[1], position[2] + 0.01], MAT.panelInset, visibleRoot, rotation);
  box(`${name}_BlueStrap`, [0.76, 0.1, 0.35], [position[0], position[1], position[2] - 0.03], MAT.blueSoft, visibleRoot, rotation);
  roundedBox(`${name}_HeadPillow`, [0.48, 0.3, 0.38], [position[0], position[1] + 0.34, position[2] - 0.04], MAT.softWhite, visibleRoot, rotation, 0.12);
  for (const offsetY of [-0.29, -0.09, 0.11]) {
    box(`${name}_Stitch_${offsetY}`, [0.55, 0.008, 0.007], [position[0], position[1] + offsetY, position[2] + 0.166], MAT.panelInset, visibleRoot, rotation);
  }
  collisionBox(name.replace("VIS_", ""), [0.76, 1.16, 0.36], position, rotation);
}

addSleepBag("INTERACT_SleepBag_Port", [-1.15, 0.05, -5.78], [0, 0, -0.08], true);
addSleepBag("VIS_SleepBag_Starboard", [1.15, 0.05, -5.78], [0, 0, 0.08]);
addSleepBag("VIS_SleepBag_LowerPort", [-0.65, -0.92, -5.74], [0, 0, Math.PI / 2]);
addSleepBag("VIS_SleepBag_LowerStarboard", [0.65, -0.92, -5.74], [0, 0, Math.PI / 2]);
addSleepBag("VIS_SleepBag_UpperPort", [-0.62, 0.86, -6.08], [0, 0, -0.28]);
addSleepBag("VIS_SleepBag_UpperStarboard", [0.62, 0.88, -6.05], [0, 0, 0.24]);

box("VIS_ChineseFlagField", [0.025, 0.34, 0.5], [1.595, 0.62, -2.95], MAT.red);
cylinder("VIS_ChineseFlagMark", 0.055, 0.018, [1.575, 0.7, -3.08], MAT.yellow, [0, 0, Math.PI / 2], visibleRoot, 5);

for (const z of [-4.3, -1.8, 0.7, 3.2]) {
  for (const side of [-1, 1]) {
    roundedBox(`VIS_SoftStowage_${side}_${z}`, [0.2, 0.46, 0.72], [side * 1.49, -0.91, z], MAT.softWhite, visibleRoot, [0, 0, 0], 0.09);
    box(`VIS_StowageStrap_${side}_${z}`, [0.22, 0.075, 0.76], [side * 1.475, -0.91, z], MAT.blueSoft);
  }
}

collisionBox("Hull_Port", [0.12, 3.08, 14.0], [-1.73, 0, 0]);
collisionBox("Hull_Starboard", [0.12, 3.08, 14.0], [1.73, 0, 0]);
collisionBox("Hull_Deck", [3.34, 0.12, 14.0], [0, -1.52, 0]);
collisionBox("Hull_Ceiling", [3.34, 0.12, 14.0], [0, 1.52, 0]);

const spawn = new THREE.Object3D();
spawn.name = "SPAWN_Tianhe_Entry";
// The deck is at -1.52 m; this places the camera at a 1.92 m standing sightline.
spawn.position.set(0, 0.4, 5.65);
scene.add(spawn);

scene.traverse((object) => {
  if (object instanceof THREE.Mesh) {
    object.geometry.computeBoundingBox();
    object.geometry.computeVertexNormals();
  }
});

const exporter = new GLTFExporter();
const result = await exporter.parseAsync(scene, {
  binary: true,
  onlyVisible: false,
  trs: true,
});

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, Buffer.from(result));
await writeSurfaceTexture();
console.log(`Exported ${outputPath}`);
