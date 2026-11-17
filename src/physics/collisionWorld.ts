import * as THREE from 'three';
import { ColliderBox, HitZoneResult, MaterialType, RampCollider } from '../types';

export interface WorldImpact {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  material: MaterialType;
  isExit?: boolean;
}

export interface BulletCastOutput {
  impacts: WorldImpact[];
  entityHit: HitZoneResult | null;
  endPoint: THREE.Vector3;
}

export interface TargetableEntity {
  id: string;
  alive: boolean;
  x: number;
  y: number; // feet Y
  z: number;
  crouching: boolean;
  canBeHit: boolean;
}

export interface MoveState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  groundMaterial: MaterialType;
  underground: boolean;
  zoneName: string;
}

export class CollisionWorld {
  public boxes: ColliderBox[] = [];
  public ramps: RampCollider[] = [];

  public clear(): void {
    this.boxes = [];
    this.ramps = [];
  }

  public addBox(box: ColliderBox): void {
    this.boxes.push(box);
  }

  public addRamp(ramp: RampCollider): void {
    this.ramps.push(ramp);
  }

  public moveCharacter(
    state: MoveState,
    wishVelX: number,
    wishVelZ: number,
    dt: number,
    radius: number,
    height: number,
    gravity = 19.6
  ): void {
    state.vx = wishVelX;
    state.vz = wishVelZ;
    state.vy -= gravity * dt;
    if (state.vy < -32) state.vy = -32;

    const totalDx = state.vx * dt;
    const totalDz = state.vz * dt;
    const horizDist = Math.hypot(totalDx, totalDz);
    const steps = Math.max(1, Math.ceil(horizDist / 0.15));
    const stepDx = totalDx / steps;
    const stepDz = totalDz / steps;
    const stepHeight = 0.48;

    for (let s = 0; s < steps; s++) {
      state.x += stepDx;
      state.z += stepDz;
      this.resolveHorizontal(state, radius, height, stepHeight);
    }

    // Vertical integration
    state.y += state.vy * dt;
    state.grounded = false;

    // 1. Check ramps first
    for (const r of this.ramps) {
      if (
        state.x + radius * 0.55 >= r.minX &&
        state.x - radius * 0.55 <= r.maxX &&
        state.z + radius * 0.55 >= r.minZ &&
        state.z - radius * 0.55 <= r.maxZ
      ) {
        const t =
          r.axis === 'z'
            ? THREE.MathUtils.clamp((state.z - r.minZ) / (r.maxZ - r.minZ), 0, 1)
            : THREE.MathUtils.clamp((state.x - r.minX) / (r.maxX - r.minX), 0, 1);
        const surfY = THREE.MathUtils.lerp(r.yAtMin, r.yAtMax, t);
        if (state.vy <= 0.8 && state.y >= surfY - r.thickness && state.y <= surfY + 0.46) {
          state.y = surfY;
          state.vy = 0;
          state.grounded = true;
          state.groundMaterial = r.material;
        }
      }
    }

    // 2. Check AABB floors & ceilings
    for (const b of this.boxes) {
      if (!this.circleIntersectsRect(state.x, state.z, radius * 0.88, b.minX, b.maxX, b.minZ, b.maxZ)) {
        continue;
      }

      // Landing on top of box
      if (state.vy <= 0 && state.y <= b.maxY && state.y >= b.maxY - 0.55 && b.maxY > b.minY + 0.04) {
        // Ensure head fits above b.maxY without clipping into the same box
        state.y = b.maxY;
        state.vy = 0;
        state.grounded = true;
        state.groundMaterial = b.material;
        if (b.zoneName) state.zoneName = b.zoneName;
      } else if (state.vy > 0 && state.y + height > b.minY && state.y < b.minY) {
        // Bumping head on ceiling (underground deck underside / bunker roof / hollow container roof)
        state.y = b.minY - height;
        state.vy = 0;
      }
    }

    // Arena safety clamp (prevent ever falling into infinite ocean)
    state.x = THREE.MathUtils.clamp(state.x, -16.55, 16.55);
    state.z = THREE.MathUtils.clamp(state.z, -43.55, 43.55);
    if (state.y < -3.25) {
      state.y = -3.2;
      state.vy = 0;
      state.grounded = true;
      state.groundMaterial = 'steel';
    }

    state.underground = state.y < -0.7;
    state.zoneName = this.computeZoneCallout(state.x, state.y, state.z);
  }

  private resolveHorizontal(state: MoveState, radius: number, height: number, stepHeight: number): void {
    for (const b of this.boxes) {
      // Vertical overlap check
      if (state.y + height <= b.minY + 0.03 || state.y >= b.maxY - 0.03) {
        continue;
      }

      // Closest point on XZ rectangle to circle center
      const cx = THREE.MathUtils.clamp(state.x, b.minX, b.maxX);
      const cz = THREE.MathUtils.clamp(state.z, b.minZ, b.maxZ);
      const dx = state.x - cx;
      const dz = state.z - cz;
      const distSq = dx * dx + dz * dz;

      if (distSq >= radius * radius) continue;

      // Can we auto-step onto a low ledge / container floor lip / stair?
      const climbNeeded = b.maxY - state.y;
      if (!b.noStepUp && climbNeeded > 0 && climbNeeded <= stepHeight && state.vy <= 1.2) {
        if (!this.hasHeadObstructionAt(state.x, b.maxY, state.z, radius * 0.82, height, b.id)) {
          state.y = b.maxY;
          state.grounded = true;
          state.groundMaterial = b.material;
          continue;
        }
      }

      // Push out horizontally along minimum penetration axis
      if (distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        state.x += (dx / dist) * push;
        state.z += (dz / dist) * push;
      } else {
        // Center is inside AABB: push out nearest face
        const left = Math.abs(state.x - b.minX);
        const right = Math.abs(b.maxX - state.x);
        const back = Math.abs(state.z - b.minZ);
        const front = Math.abs(b.maxZ - state.z);
        const m = Math.min(left, right, back, front);
        if (m === left) state.x = b.minX - radius;
        else if (m === right) state.x = b.maxX + radius;
        else if (m === back) state.z = b.minZ - radius;
        else state.z = b.maxZ + radius;
      }
    }
  }

  public hasHeadObstructionAt(
    x: number,
    footY: number,
    z: number,
    radius: number,
    height: number,
    ignoreId?: string
  ): boolean {
    for (const b of this.boxes) {
      if (b.id === ignoreId) continue;
      if (footY + height <= b.minY + 0.04 || footY + 0.08 >= b.maxY) continue;
      if (this.circleIntersectsRect(x, z, radius, b.minX, b.maxX, b.minZ, b.maxZ)) {
        return true;
      }
    }
    return false;
  }

  private circleIntersectsRect(
    x: number,
    z: number,
    r: number,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number
  ): boolean {
    const cx = THREE.MathUtils.clamp(x, minX, maxX);
    const cz = THREE.MathUtils.clamp(z, minZ, maxZ);
    const dx = x - cx;
    const dz = z - cz;
    return dx * dx + dz * dz < r * r;
  }

  public computeZoneCallout(x: number, y: number, z: number): string {
    if (y < -0.8) {
      return x > 0 ? '东侧地下暗道 (下水道)' : '西侧地下暗道 (下水道)';
    }
    if (z > 33.5) return '保卫者复活基地舱';
    if (z < -33.5) return '潜伏者复活基地舱';
    if (y >= 2.2 && z > 20 && x > 9) return '保卫者狙击高台';
    if (y >= 2.2 && z < -20 && x < -9) return '潜伏者狙击高台';
    if (y >= 2.1 && Math.abs(z) <= 18) return '中路集装箱顶层';
    if (Math.abs(z) <= 7.5 && Math.abs(x) <= 2.2 && y < 2.2) return '中路开口集装箱内道';
    if (Math.abs(z) <= 16) {
      if (x < -8.5) return '西侧边路走廊';
      if (x > 8.5) return '东侧边路走廊';
      return '中路核心集装箱群';
    }
    return z > 0 ? '保卫者前场广场' : '潜伏者前场广场';
  }

  public castBulletRay(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
    woodPenetration: number,
    targets: TargetableEntity[],
    shooterId: string
  ): BulletCastOutput {
    const impacts: WorldImpact[] = [];
    const endPoint = origin.clone().addScaledVector(dir, maxDist);

    interface RayEvent {
      kind: 'world' | 'entity';
      tMin: number;
      tMax: number;
      normal: THREE.Vector3;
      box?: ColliderBox;
      entity?: TargetableEntity;
      zone?: 'head' | 'chest' | 'limb';
    }

    const events: RayEvent[] = [];

    // 1. Collect world AABB intersections
    for (const b of this.boxes) {
      const hit = this.intersectRayAABB(origin, dir, b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ, maxDist);
      if (hit) {
        events.push({
          kind: 'world',
          tMin: hit.tMin,
          tMax: hit.tMax,
          normal: hit.normal,
          box: b,
        });
      }
    }

    // 2. Collect targetable entity hitboxes (Head + Chest + Legs)
    for (const ent of targets) {
      if (!ent.alive || ent.id === shooterId || !ent.canBeHit) continue;
      const crouchOffset = ent.crouching ? -0.52 : 0;

      // Head hitbox (generous yet crisp CF headshot zone around Y+1.52..1.86)
      const headMinY = ent.y + 1.44 + crouchOffset;
      const headMaxY = ent.y + 1.88 + crouchOffset;
      const headHit = this.intersectRayAABB(
        origin,
        dir,
        ent.x - 0.23,
        ent.x + 0.23,
        headMinY,
        headMaxY,
        ent.z - 0.23,
        ent.z + 0.23,
        maxDist
      );
      if (headHit) {
        events.push({
          kind: 'entity',
          tMin: headHit.tMin,
          tMax: headHit.tMax,
          normal: headHit.normal,
          entity: ent,
          zone: 'head',
        });
      }

      // Upper torso / chest hitbox
      const chestMinY = ent.y + 0.78 + crouchOffset * 0.55;
      const chestMaxY = headMinY;
      const chestHit = this.intersectRayAABB(
        origin,
        dir,
        ent.x - 0.34,
        ent.x + 0.34,
        chestMinY,
        chestMaxY,
        ent.z - 0.28,
        ent.z + 0.28,
        maxDist
      );
      if (chestHit) {
        events.push({
          kind: 'entity',
          tMin: chestHit.tMin,
          tMax: chestHit.tMax,
          normal: chestHit.normal,
          entity: ent,
          zone: 'chest',
        });
      }

      // Lower body / limbs hitbox
      const legHit = this.intersectRayAABB(
        origin,
        dir,
        ent.x - 0.3,
        ent.x + 0.3,
        ent.y,
        chestMinY,
        ent.z - 0.26,
        ent.z + 0.26,
        maxDist
      );
      if (legHit) {
        events.push({
          kind: 'entity',
          tMin: legHit.tMin,
          tMax: legHit.tMax,
          normal: legHit.normal,
          entity: ent,
          zone: 'limb',
        });
      }
    }

    events.sort((a, b) => a.tMin - b.tMin);

    let penScale = 1.0;
    let penetrated = false;
    const hitEntityIds = new Set<string>();

    for (const ev of events) {
      if (ev.tMin < 0.05) continue;

      if (ev.kind === 'world' && ev.box) {
        const pt = origin.clone().addScaledVector(dir, ev.tMin);
        impacts.push({
          point: pt,
          normal: ev.normal,
          material: ev.box.material,
        });

        if (ev.box.penetrable && woodPenetration > 0.05) {
          // Classic CF Wooden Crate Wallbang!
          const thickness = Math.max(0.1, ev.tMax - ev.tMin);
          const thicknessPenalty = thickness > 1.85 ? woodPenetration * 0.78 : woodPenetration;
          penScale *= thicknessPenalty;
          penetrated = true;

          const exitPt = origin.clone().addScaledVector(dir, ev.tMax);
          impacts.push({
            point: exitPt,
            normal: ev.normal.clone().negate(),
            material: ev.box.material,
            isExit: true,
          });

          if (penScale < 0.14) {
            endPoint.copy(exitPt);
            return { impacts, entityHit: null, endPoint };
          }
        } else {
          // Solid steel / container / concrete stops the bullet
          endPoint.copy(pt);
          return { impacts, entityHit: null, endPoint };
        }
      } else if (ev.kind === 'entity' && ev.entity && ev.zone) {
        if (hitEntityIds.has(ev.entity.id)) continue;
        hitEntityIds.add(ev.entity.id);

        const pt = origin.clone().addScaledVector(dir, ev.tMin);
        endPoint.copy(pt);
        return {
          impacts,
          entityHit: {
            entityId: ev.entity.id,
            zone: ev.zone,
            pointX: pt.x,
            pointY: pt.y,
            pointZ: pt.z,
            distance: ev.tMin,
            penetrated,
            penetrationScale: penScale,
          },
          endPoint,
        };
      }
    }

    return { impacts, entityHit: null, endPoint };
  }

  public hasLineOfSight(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    allowWood = false
  ): { clear: boolean; throughWood: boolean } {
    const origin = new THREE.Vector3(ax, ay, az);
    const diff = new THREE.Vector3(bx - ax, by - ay, bz - az);
    const dist = diff.length();
    if (dist < 0.1) return { clear: true, throughWood: false };
    diff.divideScalar(dist);

    let throughWood = false;
    let woodCount = 0;

    for (const b of this.boxes) {
      const hit = this.intersectRayAABB(origin, diff, b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ, dist - 0.15);
      if (hit && hit.tMin > 0.08) {
        if (allowWood && b.penetrable) {
          throughWood = true;
          woodCount++;
          if (woodCount > 1) return { clear: false, throughWood: true };
        } else {
          return { clear: false, throughWood: false };
        }
      }
    }
    return { clear: true, throughWood };
  }

  public stepGrenade(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    dt: number,
    radius = 0.12
  ): { bounced: boolean; material: MaterialType } {
    vel.y -= 17.5 * dt;
    pos.addScaledVector(vel, dt);

    let bounced = false;
    let mat: MaterialType = 'steel';

    for (const b of this.boxes) {
      const cx = THREE.MathUtils.clamp(pos.x, b.minX, b.maxX);
      const cy = THREE.MathUtils.clamp(pos.y, b.minY, b.maxY);
      const cz = THREE.MathUtils.clamp(pos.z, b.minZ, b.maxZ);
      const dx = pos.x - cx;
      const dy = pos.y - cy;
      const dz = pos.z - cz;
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq < radius * radius && dSq > 1e-8) {
        const d = Math.sqrt(dSq);
        const nx = dx / d;
        const ny = dy / d;
        const nz = dz / d;
        pos.x += nx * (radius - d);
        pos.y += ny * (radius - d);
        pos.z += nz * (radius - d);
        const vn = vel.x * nx + vel.y * ny + vel.z * nz;
        if (vn < 0) {
          const restitution = ny > 0.6 ? 0.42 : 0.58; // Classic CF container bank-shot bounce ("几何雷")
          vel.x = (vel.x - (1 + restitution) * vn * nx) * 0.86;
          vel.y = (vel.y - (1 + restitution) * vn * ny) * 0.86;
          vel.z = (vel.z - (1 + restitution) * vn * nz) * 0.86;
          if (Math.abs(vn) > 1.6) {
            bounced = true;
            mat = b.material;
          }
        }
      }
    }
    return { bounced, material: mat };
  }

  private intersectRayAABB(
    orig: THREE.Vector3,
    dir: THREE.Vector3,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    minZ: number,
    maxZ: number,
    maxDist: number
  ): { tMin: number; tMax: number; normal: THREE.Vector3 } | null {
    let tMin = 0;
    let tMax = maxDist;
    let hitAxis = 0;
    let hitSign = 1;

    // X slab
    if (Math.abs(dir.x) < 1e-8) {
      if (orig.x < minX || orig.x > maxX) return null;
    } else {
      const inv = 1 / dir.x;
      let t1 = (minX - orig.x) * inv;
      let t2 = (maxX - orig.x) * inv;
      let sign = -1;
      if (t1 > t2) {
        const tmp = t1; t1 = t2; t2 = tmp;
        sign = 1;
      }
      if (t1 > tMin) {
        tMin = t1;
        hitAxis = 0;
        hitSign = sign;
      }
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return null;
    }

    // Y slab
    if (Math.abs(dir.y) < 1e-8) {
      if (orig.y < minY || orig.y > maxY) return null;
    } else {
      const inv = 1 / dir.y;
      let t1 = (minY - orig.y) * inv;
      let t2 = (maxY - orig.y) * inv;
      let sign = -1;
      if (t1 > t2) {
        const tmp = t1; t1 = t2; t2 = tmp;
        sign = 1;
      }
      if (t1 > tMin) {
        tMin = t1;
        hitAxis = 1;
        hitSign = sign;
      }
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return null;
    }

    // Z slab
    if (Math.abs(dir.z) < 1e-8) {
      if (orig.z < minZ || orig.z > maxZ) return null;
    } else {
      const inv = 1 / dir.z;
      let t1 = (minZ - orig.z) * inv;
      let t2 = (maxZ - orig.z) * inv;
      let sign = -1;
      if (t1 > t2) {
        const tmp = t1; t1 = t2; t2 = tmp;
        sign = 1;
      }
      if (t1 > tMin) {
        tMin = t1;
        hitAxis = 2;
        hitSign = sign;
      }
      if (t2 < tMax) tMax = t2;
      if (tMin > tMax) return null;
    }

    const normal = new THREE.Vector3(
      hitAxis === 0 ? hitSign : 0,
      hitAxis === 1 ? hitSign : 0,
      hitAxis === 2 ? hitSign : 0
    );
    return { tMin, tMax, normal };
  }
}
