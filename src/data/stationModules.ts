import * as THREE from "three";

export type ModuleId = "tianhe" | "wentian" | "mengtian";

export interface StationModule {
  id: ModuleId;
  name: string;
  subtitle: string;
  description: string;
  exteriorPosition: [number, number, number];
  radius: number;
  labelAnchor: [number, number, number];
}

export const MODULES: Record<ModuleId, StationModule> = {
  tianhe: {
    id: "tianhe",
    name: "天和核心舱",
    subtitle: "CORE MODULE",
    description: "空间站的生活、控制与工作主场景。",
    exteriorPosition: [0, 0, -9.35],
    radius: 2.1,
    labelAnchor: [0, 5.0, -10.2],
  },
  wentian: {
    id: "wentian",
    name: "问天实验舱",
    subtitle: "LAB MODULE",
    description: "生命科学实验与航天员出舱方向的实验舱。",
    exteriorPosition: [-9.25, 0, 0],
    radius: 2.1,
    labelAnchor: [-10.2, 5.4, 0],
  },
  mengtian: {
    id: "mengtian",
    name: "梦天实验舱",
    subtitle: "PAYLOAD MODULE",
    description: "微重力科学实验与货物载荷转移方向的实验舱。",
    exteriorPosition: [9.25, 0, 0],
    radius: 2.1,
    labelAnchor: [10.2, 5.4, 0],
  },
};

export const MODULE_IDS = Object.keys(MODULES) as ModuleId[];

export function vector(values: [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(values[0], values[1], values[2]);
}
