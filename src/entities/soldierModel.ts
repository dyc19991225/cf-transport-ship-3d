import * as THREE from 'three';
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

  constructor(team: TeamId, isAllyToPlayer: boolean, weaponId: WeaponId) {
    this.root.add(this.bodyPivot);

    // Distinct authentic CrossFire faction uniforms:
    // GR 保卫者: Navy-slate SWAT uniform, black tactical vest, PASGT helmet + blue visor goggles
    // BL 潜伏者: Desert tan mercenary jacket, dark olive chest rig, crimson/tan bandana + balaclava
    const uniformMat = new THREE.MeshStandardMaterial({
      color: team === 'GR' ? 0x26415e : 0xb28c5a,
      roughness: 0.78,
    });
    const pantsMat = new THREE.MeshStandardMaterial({
      color: team === 'GR' ? 0x1c2d40 : 0x6e593d,
      roughness: 0.82,
    });
    const vestMat = new THREE.MeshStandardMaterial({
      color: team === 'GR' ? 0x161c24 : 0x332d24,
      roughness: 0.68,
      metalness: 0.2,
    });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd8a984, roughness: 0.72 });
    const headGearMat = new THREE.MeshStandardMaterial({
      color: team === 'GR' ? 0x1e2c3c : 0x992820,
      roughness: 0.56,
    });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.75 });

    // Pelvis & Tactical Torso
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.26), pantsMat);
    pelvis.position.y = 0.84;
    pelvis.castShadow = true;
    this.bodyPivot.add(pelvis);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.54, 0.28), uniformMat);
    torso.position.y = 1.21;
    torso.castShadow = true;
    this.bodyPivot.add(torso);

    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.51, 0.44, 0.32), vestMat);
    vest.position.y = 1.22;
    vest.castShadow = true;
    this.bodyPivot.add(vest);

    // Head + Helmet / Bandana (Center around Y = 1.66m — matches exact CF Headshot Seam!)
    this.headGroup.position.set(0, 1.54, 0);
    this.bodyPivot.add(this.headGroup);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.28), skinMat);
    head.position.y = 0.14;
    head.castShadow = true;
    this.headGroup.add(head);

    if (team === 'GR') {
      // Tactical SWAT Helmet + Goggles
      const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.2, 0.33), headGearMat);
      helmet.position.y = 0.22;
      this.headGroup.add(helmet);

      const goggles = new THREE.Mesh(
        new THREE.BoxGeometry(0.29, 0.08, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x3b8fd9, metalness: 0.75, roughness: 0.2 })
      );
      goggles.position.set(0, 0.16, -0.14);
      this.headGroup.add(goggles);
    } else {
      // Black List Bandana + Dark Balaclava Mask
      const bandana = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.13, 0.31), headGearMat);
      bandana.position.y = 0.23;
      this.headGroup.add(bandana);

      const mask = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.15, 0.29), vestMat);
      mask.position.y = 0.08;
      this.headGroup.add(mask);
    }

    // Arms + Third-Person Rifle/Sniper
    this.armRightPivot.position.set(0.31, 1.4, 0);
    this.armLeftPivot.position.set(-0.31, 1.4, 0);
    this.bodyPivot.add(this.armRightPivot, this.armLeftPivot);

    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), uniformMat);
    armR.position.set(-0.04, -0.18, -0.14);
    armR.rotation.x = Math.PI / 2.4;
    armR.castShadow = true;
    this.armRightPivot.add(armR);

    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), uniformMat);
    armL.position.set(0.12, -0.18, -0.18);
    armL.rotation.set(Math.PI / 2.3, -0.32, 0);
    armL.castShadow = true;
    this.armLeftPivot.add(armL);

    // 3rd-Person Gun Mesh
    const gunLen = weaponId === 'barrett' ? 1.05 : weaponId === 'awm' ? 0.95 : 0.76;
    const gunCol = weaponId === 'awm' ? 0x3b5c35 : weaponId === 'ak47' ? 0x5c2618 : 0x22272e;
    const gunMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.11, gunLen),
      new THREE.MeshStandardMaterial({ color: gunCol, metalness: 0.55, roughness: 0.45 })
    );
    gunMesh.position.set(-0.08, -0.14, -0.44);
    this.armRightPivot.add(gunMesh);

    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd25a })
    );
    flash.position.set(-0.08, -0.14, -0.44 - gunLen / 2);
    flash.visible = false;
    this.armRightPivot.add(flash);
    this.muzzleFlash = flash;

    // Legs + Combat Boots
    this.legLeftPivot.position.set(-0.13, 0.76, 0);
    this.legRightPivot.position.set(0.13, 0.76, 0);
    this.bodyPivot.add(this.legLeftPivot, this.legRightPivot);

    for (const piv of [this.legLeftPivot, this.legRightPivot]) {
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.62, 0.19), pantsMat);
      thigh.position.y = -0.31;
      thigh.castShadow = true;
      piv.add(thigh);

      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.25), bootMat);
      boot.position.set(0, -0.67, -0.03);
      piv.add(boot);
    }

    // Golden Spawn Invulnerability Aura Shell (just like CrossFire's 3s golden glow!)
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

    // Friendly Teammate Overhead Chevron Sprite (so player never shoots allies!)
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
      sp.position.set(0, 2.12, 0);
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
      // Dramatic collapse onto ship deck
      const fall = Math.min(1, deathProgress / 0.36);
      this.bodyPivot.rotation.x = -fall * (Math.PI / 2.05);
      this.bodyPivot.position.y = fall * 0.14;
      return;
    }

    // Crouch stance compression
    const crouchDrop = crouching ? -0.46 : 0;
    this.bodyPivot.position.y = THREE.MathUtils.lerp(this.bodyPivot.position.y, crouchDrop, Math.min(1, dt * 14));
    this.bodyPivot.rotation.x = -this.hitFlinch * 1.1;

    // Aim pitch on arms & head
    const clampedPitch = THREE.MathUtils.clamp(pitch, -0.75, 0.75);
    this.armRightPivot.rotation.x = clampedPitch;
    this.armLeftPivot.rotation.x = clampedPitch;
    this.headGroup.rotation.x = clampedPitch * 0.65;

    // Leg swing animation
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
