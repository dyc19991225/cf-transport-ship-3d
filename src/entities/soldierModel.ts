import * as THREE from 'three';
import { LoadedGameAssets } from '../assets/assetManager';
import { TeamId, WeaponId } from '../types';

export class SoldierVisualRig {
  public readonly root = new THREE.Group();
  private readonly bodyPivot = new THREE.Group();
  private readonly headGroup = new THREE.Group();
  private readonly armRightPivot = new THREE.Group();
  private readonly armLeftPivot = new THREE.Group();
  private readonly legLeftPivot = new THREE.Group();
  private readonly legRightPivot = new THREE.Group();
  private readonly muzzleFlash: THREE.Mesh;
  private readonly spawnShieldShell: THREE.Mesh;
  private readonly allyMarker: THREE.Sprite | null = null;

  private walkPhase = Math.random() * Math.PI * 2;
  private flashTimer = 0;
  private hitFlinch = 0;

  constructor(team: TeamId, isAllyToPlayer: boolean, weaponId: WeaponId, assets: LoadedGameAssets) {
    this.root.add(this.bodyPivot);

    // 1. Blender 5.3 Sculpted Torso + MOLLE Plate Carrier + Mag Pouches + Radio!
    const torso = assets.createSoldierLimb(team, 'Torso');
    this.bodyPivot.add(torso);

    // 2. Blender 5.3 Sculpted Head + PASGT Helmet/NVG/Goggles (GR) or Crimson Bandana/Shades (BL)!
    this.headGroup.position.set(0, 1.48, 0);
    this.headGroup.add(assets.createSoldierLimb(team, 'Head'));
    this.bodyPivot.add(this.headGroup);

    // 3. Blender 5.3 Sculpted Articulated Arms + Deltoid Pads + Elbow Pads + Gloves + V2 Weapon!
    this.armRightPivot.position.set(0.235, 1.39, 0);
    this.armLeftPivot.position.set(-0.235, 1.39, 0);
    this.armRightPivot.add(assets.createSoldierLimb(team, 'ArmR'));
    this.armLeftPivot.add(assets.createSoldierLimb(team, 'ArmL'));
    this.bodyPivot.add(this.armRightPivot, this.armLeftPivot);

    const thirdPersonGun = assets.createWeaponMesh(weaponId);
    thirdPersonGun.scale.setScalar(1.08);
    thirdPersonGun.position.set(-0.09, -0.17, -0.18);
    this.armRightPivot.add(thirdPersonGun);

    const gunLen = weaponId === 'barrett' ? 0.96 : weaponId === 'awm' ? 0.88 : 0.74;
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd25a })
    );
    flash.position.set(-0.07, -0.15, -0.2 - gunLen);
    flash.visible = false;
    this.armRightPivot.add(flash);
    this.muzzleFlash = flash;

    // 4. Blender 5.3 Sculpted Articulated Cargo Legs + Knee Pads + Laced Combat Boots!
    this.legLeftPivot.position.set(-0.12, 0.78, 0);
    this.legRightPivot.position.set(0.12, 0.78, 0);
    this.legLeftPivot.add(assets.createSoldierLimb(team, 'LegL'));
    this.legRightPivot.add(assets.createSoldierLimb(team, 'LegR'));
    this.bodyPivot.add(this.legLeftPivot, this.legRightPivot);

    // Golden Spawn Protection Shield Aura
    this.spawnShieldShell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.48, 1.88, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffc838,
        wireframe: true,
        transparent: true,
        opacity: 0.55,
      })
    );
    this.spawnShieldShell.position.y = 0.95;
    this.root.add(this.spawnShieldShell);

    // Friendly Teammate Chevron Marker
    if (isAllyToPlayer) {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#3dc2ff';
      ctx.beginPath();
      ctx.moveTo(32, 48);
      ctx.lineTo(12, 18);
      ctx.lineTo(52, 18);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#081826';
      ctx.lineWidth = 4;
      ctx.stroke();

      const tex = new THREE.CanvasTexture(c);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
      sp.scale.set(0.34, 0.34, 1);
      sp.position.set(0, 2.14, 0);
      this.root.add(sp);
      this.allyMarker = sp;
    }
  }

  public triggerMuzzleFlash(): void {
    this.flashTimer = 0.055;
    this.muzzleFlash.visible = true;
  }

  public triggerHitFlinch(): void {
    this.hitFlinch = 0.16;
  }

  public update(
    dt: number,
    x: number,
    y: number,
    z: number,
    yaw: number,
    pitch: number,
    speed: number,
    crouching: boolean,
    alive: boolean,
    deathProgress: number,
    invulnTimer: number
  ): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.muzzleFlash.visible = false;
    }
    if (this.hitFlinch > 0) {
      this.hitFlinch = Math.max(0, this.hitFlinch - dt);
    }

    this.spawnShieldShell.visible = alive && invulnTimer > 0;
    if (this.spawnShieldShell.visible) {
      this.spawnShieldShell.rotation.y += dt * 4.5;
    }
    if (this.allyMarker) {
      this.allyMarker.visible = alive;
    }

    if (!alive) {
      const fall = Math.min(1, deathProgress / 0.36);
      this.bodyPivot.rotation.x = -fall * (Math.PI / 2.05);
      this.bodyPivot.position.y = fall * 0.14;
      return;
    }

    const crouchDrop = crouching ? -0.46 : 0;
    this.bodyPivot.position.y = THREE.MathUtils.lerp(this.bodyPivot.position.y, crouchDrop, Math.min(1, dt * 14));
    this.bodyPivot.rotation.x = -this.hitFlinch * 1.1;

    const clampedPitch = THREE.MathUtils.clamp(pitch, -0.75, 0.75);
    this.armRightPivot.rotation.x = clampedPitch;
    this.armLeftPivot.rotation.x = clampedPitch;
    this.headGroup.rotation.x = clampedPitch * 0.65;

    if (speed > 0.35) {
      this.walkPhase += dt * (4.5 + speed * 1.45);
      const swing = Math.sin(this.walkPhase) * 0.58;
      this.legLeftPivot.rotation.x = swing;
      this.legRightPivot.rotation.x = -swing;
    } else {
      this.legLeftPivot.rotation.x = THREE.MathUtils.lerp(this.legLeftPivot.rotation.x, crouching ? 0.55 : 0, dt * 10);
      this.legRightPivot.rotation.x = THREE.MathUtils.lerp(this.legRightPivot.rotation.x, crouching ? -0.35 : 0, dt * 10);
    }
  }
}
