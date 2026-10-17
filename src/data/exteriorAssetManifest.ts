export const EXTERIOR_ASSET_MANIFEST = {
  version: "v5-real-earth-articulated-arm-pass",
  model: "/models/station-exterior-v5.glb?v=20261016-2126",
  sourceBlend: "public/models/station-exterior-v5.blend",
  blenderVersion: "5.2.3 LTS Release Candidate",
  status: "public-reference-constrained exterior reconstruction",
  modules: ["tianhe", "wentian", "mengtian"],
  notes: [
    "Independent Blender asset rebuilt against official public system diagrams and multi-angle mission imagery.",
    "The runtime model follows the uploaded nadir references, including representative forward crew and aft cargo vehicles.",
    "Rear surfaces use restrained public-reference approximations for service trays, cable runs, sensors, and solar-array backing structure.",
    "Robotic arms use segmented insulated booms, rotary housings, cable harnesses, cameras, and grapple end effectors.",
    "It is not official CAD, a surveyed engineering model, or a claim about unpublished hardware.",
  ],
} as const;
