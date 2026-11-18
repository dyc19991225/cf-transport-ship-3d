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
  private readonly gunHolder = new THREE.Group();
  private readonly muzzleFlash: THREE.Mesh;
  private readonly spawnShieldShell: THREE.Mesh;
  private readonly allyMarker: THREE.Sprite | null = null;
  private readonly twinTailLeft: THREE.Group | null = null;
  private readonly twinTailRight: THREE.Group | null = null;

  private walkPhase = Math.random() * Math.PI * 2;
  private flashTimer = 0;
  private hitFlinch = 0;
  private lastYaw = 0;
  private tailSwing = 0;

  constructor(
    team: TeamId,
    isAllyToPlayer: boolean,
    weaponId: WeaponId,
    assets: LoadedGameAssets,
    isHeroGirl = false,
    showAllyChevron = true
  ) {
    this.root.add(this.bodyPivot);

    if (isHeroGirl) {
      // 1. Sculpted Anime Techwear Girl Torso + Hoodie + Pleated Skirt + Crossbody Bag
      this.bodyPivot.add(assets.createHeroLimb('Torso'));

      // 2. Anime Head + Projected Amethyst Eyes + O-Ring Choker + Bangs + Ribbon Bows + Dynamic Twin-Tails!
      this.headGroup.position.set(0, 1.43, 0);
      this.headGroup.add(assets.createHeroLimb('Head'));

      const ttL = new THREE.Group();
      ttL.position.set(-0.118, 0.195, 0.025);
      ttL.add(assets.createHeroLimb('TwinTailL'));
      const ttR = new THREE.Group();
      ttR.position.set(0.118, 0.195, 0.025);
      ttR.add(assets.createHeroLimb('TwinTailR'));
      this.headGroup.add(ttL, ttR);
      this.twinTailLeft = ttL;
      this.twinTailRight = ttR;
      this.bodyPivot.add(this.headGroup);

      // 3. Billowy Black-Purple Techwear Sleeves + Weapon Grip
      this.armRightPivot.position.set(0.16, 1.33, 0);
      this.armLeftPivot.position.set(-0.16, 1.33, 0);
      this.armRightPivot.add(assets.createHeroLimb('ArmR'));
      this.armLeftPivot.add(assets.createHeroLimb('ArmL'));
      this.bodyPivot.add(this.armRightPivot, this.armLeftPivot);

      this.gunHolder.position.set(-0.075, -0.17, -0.31);
      this.armRightPivot.add(this.gunHolder);

      // 4. Sheer Dark Pantyhose Legs + Thigh Garter + Chunky Platform Sneakers
      this.legLeftPivot.position.set(-0.075, 0.85, 0);
      this.legRightPivot.position.set(0.075, 0.85, 0);
      this.legLeftPivot.add(assets.createHeroLimb('LegL'));
      this.legRightPivot.add(assets.createHeroLimb('LegR'));
      this.bodyPivot.add(this.legLeftPivot, this.legRightPivot);
    } else {
      // Classic High-Poly GR SWAT / BL Mercenary Rig
      this.bodyPivot.add(assets.createSoldierLimb(team, 'Torso'));

      this.headGroup.position.set(0, 1.48, 0);
      this.headGroup.add(assets.createSoldierLimb(team, 'Head'));
      this.bodyPivot.add(this.headGroup);

      this.armRightPivot.position.set(0.235, 1.39, 0);
      this.armLeftPivot.position.set(-0.235, 1.39, 0);
      this.armRightPivot.add(assets.createSoldierLimb(team, 'ArmR'));
      this.armLeftPivot.add(assets.createSoldierLimb(team, 'ArmL'));
      this.bodyPivot.add(this.armRightPivot, this.armLeftPivot);

      this.gunHolder.position.set(-0.09, -0.17, -0.18);
      this.armRightPivot.add(this.gunHolder);

      this.legLeftPivot.position.set(-0.12, 0.78, 0);
      this.legRightPivot.position.set(0.12, 0.78, 0);
      this.legLeftPivot.add(assets.createSoldierLimb(team, 'LegL'));
      this.legRightPivot.add(assets.createSoldierLimb(team, 'LegR'));
      this.bodyPivot.add(this.legLeftPivot, this.legRightPivot);
    }

    this.setWeapon(weaponId, assets);

    const gunLen = weaponId === 'barrett' ? 0.96 : weaponId === 'awm' ? 0.88 : 0.74;
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd25a })
    );
    flash.position.set(-0.085, -0.15, -0.2 - gunLen);
    flash.visible = false;
    this.armRightPivot.add(flash);
    this.muzzleFlash = flash;

    this.spawnShieldShell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.46, 1.86, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffc838,
        wireframe: true,
        transparent: true,
        opacity: 0.52,
      })
    );
    this.spawnShieldShell.position.y = 0.94;
    this.root.add(this.spawnShieldShell);

    if (isAllyToPlayer && showAllyChevron) {
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
      sp.position.set(0, 2.12, 0);
      this.root.add(sp);
      this.allyMarker = sp;
    }
  }

  public setWeapon(weaponId: WeaponId, assets: LoadedGameAssets): void {
    this.gunHolder.clear();
    const gun = assets.createWeaponMesh(weaponId);
    gun.scale.setScalar(1.06);
    this.gunHolder.add(gun);
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

    const yawVel = (yaw - this.lastYaw) / Math.max(0.001, dt);
    this.lastYaw = yaw;

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

    const crouchDrop = crouching ? -0.44 : 0;
    this.bodyPivot.position.y = THREE.MathUtils.lerp(this.bodyPivot.position.y, crouchDrop, Math.min(1, dt * 14));
    this.bodyPivot.rotation.x = -this.hitFlinch * 1.1;

    const clampedPitch = THREE.MathUtils.clamp(pitch, -0.75, 0.75);
    this.armRightPivot.rotation.x = clampedPitch;
    this.armLeftPivot.rotation.x = clampedPitch;
    this.headGroup.rotation.x = clampedPitch * 0.6;

    if (speed > 0.35) {
      this.walkPhase += dt * (4.6 + speed * 1.45);
      const swing = Math.sin(this.walkPhase) * 0.56;
      this.legLeftPivot.rotation.x = swing;
      this.legRightPivot.rotation.x = -swing;
    } else {
      this.walkPhase += dt * 1.6;
      this.legLeftPivot.rotation.x = THREE.MathUtils.lerp(this.legLeftPivot.rotation.x, crouching ? 0.52 : 0, dt * 10);
      this.legRightPivot.rotation.x = THREE.MathUtils.lerp(this.legRightPivot.rotation.x, crouching ? -0.34 : 0, dt * 10);
    }

    // Dynamic Twin-Tail Physics Sway & Run Bounce!
    if (this.twinTailLeft && this.twinTailRight) {
      const targetTailSway = THREE.MathUtils.clamp(-yawVel * 0.045, -0.38, 0.38);
      this.tailSwing = THREE.MathUtils.lerp(this.tailSwing, targetTailSway, Math.min(1, dt * 9));
      const runBounce = speed > 0.35 ? Math.abs(Math.sin(this.walkPhase)) * 0.22 + 0.12 : Math.sin(this.walkPhase) * 0.03;
      this.twinTailLeft.rotation.set(runBounce, 0, -0.06 + this.tailSwing - runBounce * 0.35);
      this.twinTailRight.rotation.set(runBounce, 0, 0.06 + this.tailSwing + runBounce * 0.35);
    }
  }
}
