export type TeamId = 'GR' | 'BL';

export type MaterialType = 'steel' | 'container' | 'wood' | 'concrete' | 'water';

export type WeaponId = 'ak47' | 'm4a1s' | 'awm' | 'barrett' | 'deagle' | 'kukri' | 'he_grenade';

export type WeaponSlot = 1 | 2 | 3 | 4;

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  shortName: string;
  slot: WeaponSlot;
  category: 'rifle' | 'sniper' | 'pistol' | 'melee' | 'grenade';
  damageHead: number;
  damageChest: number;
  damageStomach: number;
  damageLimb: number;
  armorPenetration: number; // 0..1
  woodPenetration: number; // 0..1 multiplier retained per wooden obstacle
  rpm: number; // rounds per minute
  automatic: boolean;
  magSize: number;
  reserveAmmo: number;
  reloadTime: number; // seconds
  drawTime: number; // seconds
  moveSpeedMult: number; // 1.0 = base, >1 faster with knife
  baseSpread: number; // radians
  moveSpread: number;
  recoilPitch: number;
  recoilYaw: number;
  recoilRecovery: number;
  zoomLevels?: number[]; // e.g., [2.5, 6.0] for snipers
  boltTime?: number; // bolt-action cycle delay
  suppressed?: boolean;
  heavyDamage?: number; // right-click knife heavy slash
}

export interface LoadoutBag {
  index: number;
  name: string;
  primary: WeaponId;
  secondary: WeaponId;
  melee: WeaponId;
  grenade: WeaponId;
}

export interface ColliderBox {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  material: MaterialType;
  penetrable: boolean;
  noStepUp?: boolean;
  isHollowWall?: boolean;
  zoneName?: string;
}

export interface RampCollider {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  axis: 'x' | 'z';
  yAtMin: number;
  yAtMax: number;
  thickness: number;
  material: MaterialType;
}

export interface WayNode {
  id: string;
  x: number;
  y: number;
  z: number;
  neighbors: string[];
  tag: 'spawn_gr' | 'spawn_bl' | 'mid' | 'left' | 'right' | 'sniper_gr' | 'sniper_bl' | 'tunnel' | 'container';
}

export interface MatchConfig {
  playerTeam: TeamId;
  teamSize: number; // 5 or 8
  targetKills: number; // 50, 100, 150
  difficulty: 'easy' | 'normal' | 'hard';
  initialBag: number;
  sensitivity: number;
}

export interface HitZoneResult {
  entityId: string;
  zone: 'head' | 'chest' | 'limb';
  pointX: number;
  pointY: number;
  pointZ: number;
  distance: number;
  penetrated: boolean;
  penetrationScale: number;
}
