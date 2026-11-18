import * as THREE from 'three';
import { LoadedGameAssets } from '../assets/assetManager';
import { CollisionWorld, MoveState } from '../physics/collisionWorld';
import { SpawnPoint } from '../map/transportShipBuilder';
import { SoldierVisualRig } from './soldierModel';
import { TeamId, WayNode, WeaponId } from '../types';
import { WEAPONS } from '../weapons/weaponDefs';

const BOT_CALLSIGNS_GR = [
  '70kg·狙神', '白鲨_AyoM', '念旧_M4王', '常旭_战神', '绿豆_大炮', '年鹏_队长', '子豪_突破',
];
const BOT_CALLSIGNS_BL = [
  '马哲_MZ', '绝迹_AK帝', 'Even_孤狼', '漠然_暗道', '肖奇伦_点射', '林肯_火麒麟', '潇潇_瞬狙',
];

export type BotRole = 'mid_rusher' | 'sniper_tower' | 'tunnel_flanker' | 'side_lane';

export interface BotFireRequest {
  bot: BotSoldier;
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  weaponId: WeaponId;
}

export interface BotGrenadeRequest {
  bot: BotSoldier;
  origin: THREE.Vector3;
  vel: THREE.Vector3;
}

export class BotSoldier {
  public readonly id: string;
  public readonly name: string;
  public readonly team: TeamId;
  public readonly weaponId: WeaponId;
  public readonly role: BotRole;
  public readonly rig: SoldierVisualRig;

  public state: MoveState;
  public hp = 100;
  public armor = 100;
  public alive = true;
  public crouching = false;
  public yaw = 0;
  public pitch = 0;
  public kills = 0;
  public deaths = 0;
  public headshots = 0;
  public ping: number;

  public invulnTimer = 3.0;
  public respawnTimer = 0;
  public deathProgress = 0;
  public radarRevealTimer = 0; // Shown on radar briefly after firing

  private pathQueue: WayNode[] = [];
  private fireCooldown = 0.5;
  private reactionTimer = 0;
  private currentTargetId: string | null = null;
  private strafeDir = 1;
  private strafeTimer = 0;
  private stuckTimer = 0;
  private lastCheckPos = new THREE.Vector3();
  private footstepTimer = 0.35;
  private nadeCooldown = 9 + Math.random() * 12;

  constructor(
    index: number,
    team: TeamId,
    isAllyToPlayer: boolean,
    scene: THREE.Scene,
    spawn: SpawnPoint,
    assets: LoadedGameAssets
  ) {
    this.id = `bot_${team}_${index}`;
    const pool = team === 'GR' ? BOT_CALLSIGNS_GR : BOT_CALLSIGNS_BL;
    this.name = pool[index % pool.length];
    this.team = team;
    this.ping = 12 + Math.floor(Math.random() * 26);

    // Assign authentic tactical role & iconic CF weapon
    if (index === 0) {
      this.role = 'sniper_tower';
      this.weaponId = Math.random() < 0.65 ? 'awm' : 'barrett';
    } else if (index === 1) {
      this.role = 'tunnel_flanker';
      this.weaponId = 'm4a1s';
    } else if (index % 2 === 0) {
      this.role = 'mid_rusher';
      this.weaponId = 'ak47';
    } else {
      this.role = 'side_lane';
      this.weaponId = Math.random() < 0.5 ? 'm4a1s' : 'ak47';
    }

    this.state = {
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      vx: 0,
      vy: 0,
      vz: 0,
      grounded: true,
      groundMaterial: 'concrete',
      underground: false,
      zoneName: '',
    };
    this.yaw = spawn.yaw;
    this.lastCheckPos.set(spawn.x, spawn.y, spawn.z);

    this.rig = new SoldierVisualRig(team, isAllyToPlayer, this.weaponId, assets);
    scene.add(this.rig.root);
  }

  public destroy(scene: THREE.Scene): void {
    scene.remove(this.rig.root);
  }

  public spawnAt(sp: SpawnPoint): void {
    this.state.x = sp.x;
    this.state.y = sp.y;
    this.state.z = sp.z;
    this.state.vx = 0;
    this.state.vy = 0;
    this.state.vz = 0;
    this.yaw = sp.yaw;
    this.pitch = 0;
    this.hp = 100;
    this.armor = 100;
    this.alive = true;
    this.crouching = false;
    this.invulnTimer = 3.0;
    this.deathProgress = 0;
    this.pathQueue = [];
    this.currentTargetId = null;
    this.rig.root.visible = true;
  }

  public applyDamage(amount: number, headshot: boolean): boolean {
    if (!this.alive || this.invulnTimer > 0) return false;
    const absorbed = Math.min(this.armor, Math.round(amount * 0.22));
    this.armor = Math.max(0, this.armor - absorbed);
    this.hp -= Math.max(1, Math.round(amount));
    this.rig.triggerHitFlinch();

    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deaths++;
      this.respawnTimer = 3.2;
      this.deathProgress = 0;
      if (headshot) {
        // Extra crisp collapse
      }
      return true;
    }
    return false;
  }

  public update(
    dt: number,
    difficulty: 'easy' | 'normal' | 'hard',
    collision: CollisionWorld,
    wayNodes: WayNode[],
    enemies: Array<{ id: string; x: number; y: number; z: number; crouching: boolean; alive: boolean; invuln: boolean }>,
    spawns: SpawnPoint[],
    onFire: (req: BotFireRequest) => void,
    onGrenade: (req: BotGrenadeRequest) => void,
    onFootstep: (bot: BotSoldier) => void
  ): void {
    if (this.radarRevealTimer > 0) {
      this.radarRevealTimer = Math.max(0, this.radarRevealTimer - dt);
    }

    if (!this.alive) {
      this.deathProgress += dt;
      this.respawnTimer -= dt;
      this.rig.update(
        dt,
        this.state.x,
        this.state.y,
        this.state.z,
        this.yaw,
        this.pitch,
        0,
        false,
        false,
        this.deathProgress,
        0
      );
      if (this.respawnTimer <= 0) {
        const sp = spawns[Math.floor(Math.random() * spawns.length)];
        this.spawnAt(sp);
      }
      return;
    }

    if (this.invulnTimer > 0) {
      this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    }
    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    }
    if (this.nadeCooldown > 0) {
      this.nadeCooldown -= dt;
    }

    const eyeY = this.state.y + (this.crouching ? 1.08 : 1.62);

    // 1. Scan for visible enemy (including wood-crate wallbang awareness on normal/hard!)
    let bestEnemy: (typeof enemies)[number] | null = null;
    let bestDist = Infinity;
    let bestThroughWood = false;

    for (const en of enemies) {
      if (!en.alive) continue;
      const dx = en.x - this.state.x;
      const dz = en.z - this.state.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 68) continue;

      const targetEyeY = en.y + (en.crouching ? 1.02 : 1.54);
      const allowWood = difficulty !== 'easy' && dist < 28 && WEAPONS[this.weaponId].woodPenetration >= 0.5;
      const los = collision.hasLineOfSight(
        this.state.x,
        eyeY,
        this.state.z,
        en.x,
        targetEyeY,
        en.z,
        allowWood
      );
      if (los.clear) {
        const scoreDist = dist + (los.throughWood ? 12 : 0) + (en.invuln ? 25 : 0);
        if (scoreDist < bestDist) {
          bestDist = scoreDist;
          bestEnemy = en;
          bestThroughWood = los.throughWood;
        }
      }
    }

    // 2. Navigation Path Selection
    if (this.pathQueue.length === 0) {
      this.assignTacticalPath(wayNodes);
    }

    let wishX = 0;
    let wishZ = 0;
    const weaponSpec = WEAPONS[this.weaponId];
    const baseRunSpeed = 5.35 * weaponSpec.moveSpeedMult;

    if (bestEnemy) {
      if (this.currentTargetId !== bestEnemy.id) {
        this.currentTargetId = bestEnemy.id;
        this.reactionTimer =
          difficulty === 'easy' ? 0.56 : difficulty === 'normal' ? 0.31 : 0.17;
      } else {
        this.reactionTimer = Math.max(0, this.reactionTimer - dt);
      }

      // Smoothly aim toward target
      const aimY = bestEnemy.y + (bestEnemy.crouching ? 0.98 : 1.48);
      const dx = bestEnemy.x - this.state.x;
      const dy = aimY - eyeY;
      const dz = bestEnemy.z - this.state.z;
      const horiz = Math.max(0.01, Math.hypot(dx, dz));
      // Notice: Three.js forward -Z corresponds to yaw=0 -> sin(yaw)=-dx/horiz, cos(yaw)=-dz/horiz
      const desiredYaw = Math.atan2(-dx, -dz);
      const desiredPitch = Math.atan2(dy, horiz);

      this.yaw = lerpAngle(this.yaw, desiredYaw, Math.min(1, dt * 11));
      this.pitch = THREE.MathUtils.lerp(this.pitch, desiredPitch, Math.min(1, dt * 11));

      // Tactical combat strafe / sniper hold
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = 0.45 + Math.random() * 0.75;
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
        this.crouching = weaponSpec.category === 'sniper' ? Math.random() < 0.35 : Math.random() < 0.24;
      }

      const holdSniper = this.role === 'sniper_tower' && this.state.y > 2.0;
      if (!holdSniper && horiz > 8) {
        const rightX = Math.cos(this.yaw);
        const rightZ = -Math.sin(this.yaw);
        wishX = rightX * this.strafeDir * baseRunSpeed * 0.62;
        wishZ = rightZ * this.strafeDir * baseRunSpeed * 0.62;
      }

      // Throw tactical grenade on mid clusters occasionally
      if (
        this.nadeCooldown <= 0 &&
        !bestThroughWood &&
        horiz > 12 &&
        horiz < 30 &&
        this.state.y >= -0.2 &&
        Math.random() < 0.02
      ) {
        this.nadeCooldown = 18 + Math.random() * 14;
        const dir = new THREE.Vector3(dx / horiz, 0.34, dz / horiz).normalize();
        onGrenade({
          bot: this,
          origin: new THREE.Vector3(this.state.x, eyeY, this.state.z),
          vel: dir.multiplyScalar(Math.min(19, horiz * 0.72)),
        });
      }

      // Fire weapon once reaction timer expires!
      if (this.reactionTimer <= 0 && this.fireCooldown <= 0 && !bestEnemy.invuln) {
        this.invulnTimer = 0; // Firing cancels own spawn shield just like player
        const spreadBase =
          difficulty === 'easy' ? 0.068 : difficulty === 'normal' ? 0.038 : 0.019;
        const extraWoodSpread = bestThroughWood ? 0.025 : 0;
        const totalSpread = spreadBase + extraWoodSpread;

        const aimDir = new THREE.Vector3(dx, dy, dz).normalize();
        aimDir.x += (Math.random() - 0.5) * totalSpread * 2;
        aimDir.y += (Math.random() - 0.5) * totalSpread * 1.6;
        aimDir.z += (Math.random() - 0.5) * totalSpread * 2;
        aimDir.normalize();

        this.rig.triggerMuzzleFlash();
        this.radarRevealTimer = weaponSpec.suppressed ? 0.4 : 1.8;

        const interval = 60 / weaponSpec.rpm;
        this.fireCooldown =
          weaponSpec.category === 'sniper'
            ? (weaponSpec.boltTime ?? 1.2) + (difficulty === 'easy' ? 0.6 : 0.25)
            : interval * (difficulty === 'easy' ? 2.1 : difficulty === 'normal' ? 1.45 : 1.15);

        onFire({
          bot: this,
          origin: new THREE.Vector3(this.state.x, eyeY, this.state.z),
          dir: aimDir,
          weaponId: this.weaponId,
        });
      }
    } else {
      this.currentTargetId = null;
      this.crouching = false;

      // Follow current WayNode
      const targetNode = this.pathQueue[0];
      if (targetNode) {
        const dx = targetNode.x - this.state.x;
        const dz = targetNode.z - this.state.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.35 && Math.abs(targetNode.y - this.state.y) < 1.6) {
          this.pathQueue.shift();
          // Sniper holds position atop sniper tower for a few seconds
          if (
            (targetNode.id === 'gr_sniper_top' || targetNode.id === 'bl_sniper_top') &&
            this.role === 'sniper_tower'
          ) {
            this.yaw = this.team === 'GR' ? 0 : Math.PI;
          }
        } else if (d > 0.05) {
          wishX = (dx / d) * baseRunSpeed;
          wishZ = (dz / d) * baseRunSpeed;
          const moveYaw = Math.atan2(-dx, -dz);
          this.yaw = lerpAngle(this.yaw, moveYaw, Math.min(1, dt * 8));
          this.pitch = THREE.MathUtils.lerp(this.pitch, 0, Math.min(1, dt * 6));
        }
      }
    }

    // Anti-stuck check
    this.stuckTimer += dt;
    if (this.stuckTimer > 0.95) {
      const moved = Math.hypot(this.state.x - this.lastCheckPos.x, this.state.z - this.lastCheckPos.z);
      const holdingSniper =
        this.role === 'sniper_tower' && this.state.y > 2.1 && Math.abs(this.state.z) > 22;
      if (moved < 0.25 && !bestEnemy && !holdingSniper) {
        if (this.state.grounded) this.state.vy = 6.2;
        this.pathQueue.shift();
      }
      this.lastCheckPos.set(this.state.x, this.state.y, this.state.z);
      this.stuckTimer = 0;
    }

    const height = this.crouching ? 1.22 : 1.76;
    collision.moveCharacter(this.state, wishX, wishZ, dt, 0.36, height);

    const actualSpeed = Math.hypot(wishX, wishZ);
    if (this.state.grounded && actualSpeed > 1.2) {
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = 0.38;
        onFootstep(this);
      }
    }

    this.rig.update(
      dt,
      this.state.x,
      this.state.y,
      this.state.z,
      this.yaw,
      this.pitch,
      actualSpeed,
      this.crouching,
      true,
      0,
      this.invulnTimer
    );
  }

  private assignTacticalPath(wayNodes: WayNode[]): void {
    if (wayNodes.length === 0) return;
    const nodeMap = new Map<string, WayNode>();
    wayNodes.forEach((n) => nodeMap.set(n.id, n));

    // Closest node to current position
    let start = wayNodes[0];
    let bestD = Infinity;
    for (const n of wayNodes) {
      const d = Math.hypot(n.x - this.state.x, n.z - this.state.z) + Math.abs(n.y - this.state.y) * 2;
      if (d < bestD) {
        bestD = d;
        start = n;
      }
    }

    // Choose goal node based on tactical role!
    let candidates: WayNode[] = [];
    if (this.role === 'sniper_tower') {
      const sniperTag = this.team === 'GR' ? 'sniper_gr' : 'sniper_bl';
      candidates = wayNodes.filter((n) => n.tag === sniperTag && n.y > 2.0);
    } else if (this.role === 'tunnel_flanker') {
      const enemySideZ = this.team === 'GR' ? -20 : 20;
      candidates = wayNodes.filter(
        (n) => n.tag === 'tunnel' || (this.team === 'GR' ? n.z < enemySideZ : n.z > enemySideZ)
      );
    } else if (this.role === 'mid_rusher') {
      candidates = wayNodes.filter((n) => n.tag === 'container' || n.tag === 'mid');
    } else {
      candidates = wayNodes.filter((n) => n.tag === 'left' || n.tag === 'right' || n.tag === 'mid');
    }

    if (candidates.length === 0) candidates = wayNodes;
    const goal = candidates[Math.floor(Math.random() * candidates.length)];

    // Shortest path BFS
    const queue: string[][] = [[start.id]];
    const visited = new Set<string>([start.id]);
    while (queue.length > 0) {
      const path = queue.shift()!;
      const last = path[path.length - 1];
      if (last === goal.id) {
        this.pathQueue = path.map((id) => nodeMap.get(id)!).filter(Boolean);
        return;
      }
      const cur = nodeMap.get(last);
      if (!cur) continue;
      // Shuffle neighbors slightly for organic lane variety
      const neighbors = [...cur.neighbors].sort(() => Math.random() - 0.5);
      for (const nb of neighbors) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push([...path, nb]);
        }
      }
    }
    this.pathQueue = [goal];
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
