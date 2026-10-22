import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { TIANHE_ASSET_MANIFEST } from "../data/tianheAssetManifest";

export const TIANHE_FIXED_TIMESTEP = 1 / 60;

const PLAYER_RADIUS = 0.3;
const PLAYER_MASS = 75;
const CRUISE_SPEED = 1.2;
const BOOST_SPEED = 2.0;
const THRUST_ACCELERATION = 1.0;

export class TianhePhysics {
  readonly spawnPosition = new THREE.Vector3();
  readonly playerBody: RAPIER.RigidBody;

  private readonly world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  private readonly fixedBody: RAPIER.RigidBody;
  private grabJoint: RAPIER.ImpulseJoint | null = null;
  private grabAnchor: RAPIER.RigidBody | null = null;

  constructor(root: THREE.Object3D) {
    this.world.timestep = TIANHE_FIXED_TIMESTEP;
    this.fixedBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.createStaticColliders(root);
    this.playerBody = this.createPlayer();
  }

  get grabbed(): boolean {
    return this.grabJoint !== null;
  }

  reset(): void {
    this.release();
    this.playerBody.setTranslation(this.spawnPosition, true);
    this.playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }

  step(thrustDirection: THREE.Vector3, boost: boolean): void {
    this.playerBody.resetForces(true);
    if (!this.grabbed && thrustDirection.lengthSq() > 0) {
      thrustDirection.normalize().multiplyScalar(THRUST_ACCELERATION * PLAYER_MASS);
      this.playerBody.addForce(thrustDirection, true);
    }

    this.world.step();
    const velocity = this.playerBody.linvel();
    const maxSpeed = boost ? BOOST_SPEED : CRUISE_SPEED;
    const speedSquared = velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z;
    if (speedSquared > maxSpeed * maxSpeed) {
      const scale = maxSpeed / Math.sqrt(speedSquared);
      this.playerBody.setLinvel({ x: velocity.x * scale, y: velocity.y * scale, z: velocity.z * scale }, true);
    }
  }

  grab(worldPoint: THREE.Vector3): void {
    const player = this.playerBody.translation();
    const localAnchor = { x: worldPoint.x - player.x, y: worldPoint.y - player.y, z: worldPoint.z - player.z };
    this.grabAnchor = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(worldPoint.x, worldPoint.y, worldPoint.z),
    );
    this.grabJoint = this.world.createImpulseJoint(
      RAPIER.JointData.spherical(localAnchor, { x: 0, y: 0, z: 0 }),
      this.playerBody,
      this.grabAnchor,
      true,
    );
  }

  release(): void {
    if (this.grabJoint) this.world.removeImpulseJoint(this.grabJoint, true);
    if (this.grabAnchor) this.world.removeRigidBody(this.grabAnchor);
    this.grabJoint = null;
    this.grabAnchor = null;
  }

  private createStaticColliders(root: THREE.Object3D): void {
    root.updateMatrixWorld(true);
    const colliders: THREE.Mesh[] = [];
    root.traverse((object) => {
      if (object.name === TIANHE_ASSET_MANIFEST.spawnNode) object.getWorldPosition(this.spawnPosition);
      if (object.name.startsWith(TIANHE_ASSET_MANIFEST.colliderPrefix) && object instanceof THREE.Mesh) colliders.push(object);
    });

    if (this.spawnPosition.lengthSq() === 0) throw new Error(`Missing ${TIANHE_ASSET_MANIFEST.spawnNode}.`);
    if (colliders.length === 0) throw new Error("Tianhe interior contains no COL_ collision nodes.");

    for (const mesh of colliders) {
      mesh.visible = false;
      mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox!;
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
      const worldScale = mesh.getWorldScale(new THREE.Vector3());
      const worldRotation = mesh.getWorldQuaternion(new THREE.Quaternion());
      const collider = RAPIER.ColliderDesc.cuboid(
        Math.abs(size.x * worldScale.x) / 2,
        Math.abs(size.y * worldScale.y) / 2,
        Math.abs(size.z * worldScale.z) / 2,
      )
        .setTranslation(center.x, center.y, center.z)
        .setRotation(worldRotation)
        .setFriction(0.36)
        .setRestitution(0.02);
      this.world.createCollider(collider, this.fixedBody);
    }
  }

  private createPlayer(): RAPIER.RigidBody {
    const description = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(this.spawnPosition.x, this.spawnPosition.y, this.spawnPosition.z)
      .setGravityScale(0)
      .setLinearDamping(0.32)
      .setCanSleep(false)
      .setCcdEnabled(true)
      .setAdditionalSolverIterations(4)
      .lockRotations();
    const body = this.world.createRigidBody(description);
    const collider = RAPIER.ColliderDesc.ball(PLAYER_RADIUS)
      .setMass(PLAYER_MASS)
      .setFriction(0.36)
      .setRestitution(0.02)
      .setContactSkin(0.008);
    this.world.createCollider(collider, body);
    return body;
  }
}
