import * as THREE from "three";

export type ModuleId = "tianhe" | "wentian" | "mengtian";
export type ModuleAxis = "x" | "z";

export interface StationModule {
  id: ModuleId;
  name: string;
  subtitle: string;
  description: string;
  color: number;
  exteriorPosition: [number, number, number];
  axis: ModuleAxis;
  length: number;
  radius: number;
  labelAnchor: [number, number, number];
  cameraTarget: [number, number, number];
  entryPoint: [number, number, number];
  interiorRotation: number;
}

export const MODULES: Record<ModuleId, StationModule> = {
  tianhe: {
    id: "tianhe",
    name: "天和核心舱",
    subtitle: "CORE MODULE",
    description: "空间站的生活、控制与工作主场景。",
    color: 0xbed1d1,
    exteriorPosition: [0, 0, -9.35],
    axis: "z",
    length: 16.6,
    radius: 2.1,
    labelAnchor: [0, 5.0, -10.2],
    cameraTarget: [0, 8.5, 3.4],
    entryPoint: [0, 0, -18.5],
    interiorRotation: 0,
  },
  wentian: {
    id: "wentian",
    name: "问天实验舱",
    subtitle: "LAB MODULE",
    description: "生命科学实验与航天员出舱方向的实验舱。",
    color: 0xc4d0ce,
    exteriorPosition: [-9.25, 0, 0],
    axis: "x",
    length: 17.9,
    radius: 2.1,
    labelAnchor: [-10.2, 5.4, 0],
    cameraTarget: [-12.8, 7.3, 10.4],
    entryPoint: [-18.2, 0, 0],
    interiorRotation: -Math.PI / 2,
  },
  mengtian: {
    id: "mengtian",
    name: "梦天实验舱",
    subtitle: "PAYLOAD MODULE",
    description: "微重力科学实验与货物载荷转移方向的实验舱。",
    color: 0xb6c8c7,
    exteriorPosition: [9.25, 0, 0],
    axis: "x",
    length: 17.9,
    radius: 2.1,
    labelAnchor: [10.2, 5.4, 0],
    cameraTarget: [12.8, 7.3, 10.4],
    entryPoint: [18.2, 0, 0],
    interiorRotation: Math.PI / 2,
  },
};

export const MODULE_IDS = Object.keys(MODULES) as ModuleId[];

export function vector(values: [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(values[0], values[1], values[2]);
}
