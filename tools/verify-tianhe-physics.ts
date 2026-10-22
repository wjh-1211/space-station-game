import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import RAPIER from "@dimforge/rapier3d-compat";
import { TianhePhysics } from "../src/tianhe/TianhePhysics";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modelPath = path.join(rootDir, "public", "models", "tianhe-interior.glb");

await RAPIER.init();
console.log("Rapier initialized");
const bytes = fs.readFileSync(modelPath);
const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
  new GLTFLoader().parse(arrayBuffer, "", resolve, reject);
});
console.log("Tianhe GLB parsed");
const physics = new TianhePhysics(gltf.scene);
console.log("Physics world created");
const interactions = new Set<string>();
gltf.scene.traverse((object) => {
  if (typeof object.userData.interaction === "string") interactions.add(object.userData.interaction);
});

function drive(direction: THREE.Vector3, steps: number, origin = physics.spawnPosition): [number, number, number] {
  physics.reset();
  physics.playerBody.setTranslation(origin, true);
  for (let step = 0; step < steps; step += 1) physics.step(direction, true);
  const position = physics.playerBody.translation();
  return [position.x, position.y, position.z];
}

const positions = {
  front: drive(new THREE.Vector3(0, 0, 1), 360),
  aft: drive(new THREE.Vector3(0, 0, -1), 720),
  left: drive(new THREE.Vector3(-1, 0, 0), 360, new THREE.Vector3(0, 0, 0)),
  right: drive(new THREE.Vector3(1, 0, 0), 360, new THREE.Vector3(0, 0, 0)),
  ceiling: drive(new THREE.Vector3(0, 1, 0), 360, new THREE.Vector3(0, 0, 0)),
  deck: drive(new THREE.Vector3(0, -1, 0), 360, new THREE.Vector3(0, 0, 0)),
};

const reachedBoundaries =
  positions.front[2] > 6.3 &&
  positions.aft[2] < -6.3 &&
  positions.left[0] < -1.0 &&
  positions.right[0] > 1.0 &&
  positions.ceiling[1] > 1.0 &&
  positions.deck[1] < -1.0;
const remainedInside =
  positions.front[2] <= 6.63 &&
  positions.aft[2] >= -6.63 &&
  positions.left[0] >= -1.43 &&
  positions.right[0] <= 1.43 &&
  positions.ceiling[1] <= 1.23 &&
  positions.deck[1] >= -1.23;

physics.reset();
physics.playerBody.setTranslation({ x: 0, y: 0, z: 0 }, true);
const longRunDirections = [
  new THREE.Vector3(1, 0.4, -0.2),
  new THREE.Vector3(-0.5, 0.2, -1),
  new THREE.Vector3(-1, -0.4, 0.3),
  new THREE.Vector3(0.4, -0.8, 1),
];
let longRunInside = true;
for (let step = 0; step < 36000; step += 1) {
  physics.step(longRunDirections[Math.floor(step / 450) % longRunDirections.length], false);
  const position = physics.playerBody.translation();
  if (Math.abs(position.x) > 1.43 || Math.abs(position.y) > 1.23 || Math.abs(position.z) > 6.63) {
    longRunInside = false;
    break;
  }
}

const requiredInteractions = ["lighting", "communication", "dining", "sleep", "exercise", "handrail"];
const interactionsPresent = requiredInteractions.every((interaction) => interactions.has(interaction));

console.log(JSON.stringify({
  positions,
  reachedBoundaries,
  remainedInside,
  longRunInside,
  interactions: [...interactions].sort(),
  interactionsPresent,
}, null, 2));
if (!reachedBoundaries || !remainedInside || !longRunInside || !interactionsPresent) process.exitCode = 1;
