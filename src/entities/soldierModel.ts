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

    const uniformMat = new THREE.MeshStandardMaterial({
      color: team === 'GR' ? 0x264260 : 0xb58e5c,
      roughness: 0.76,
    });
    const pantsMat = new THREE.MeshStandardMaterial({
      color: team === 'GR' ? 0x1c2f44 : 0x6e583b,
      roughness: 0.8,
    });
    const vestMat = new THREE.MeshStandardMaterial({
      color: team === 'GR' ? 0x171e26 : 0x322b22,
      roughness: 0.62,
      metalness: 0.25,
    });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd9aa85, roughness: 0.7 });
    const headGearMat = new THREE.MeshStandardMaterial({
      color: team === 'GR' ? 0x1e2d3e : 0x9c2820,
      roughness: 0.52,
    });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x14171a, roughness: 0.7 });

    // Rounded Tactical Pelvis & Torso + MOLLE Plate Carrier Pouches
    const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.24, 12), pantsMat);
    pelvis.scale.set(1.05, 1, 0.72);
    pelvis.position.y = 0.84;
    pelvis.castShadow = true;
    this.bodyPivot.add(pelvis);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.21, 0.56, 12), uniformMat);
    torso.scale.set(1.05, 1, 0.68);
    torso.position.y = 1.21;
    torso.castShadow = true;
    this.bodyPivot.add(torso);

    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.43, 0.31), vestMat);
    vest.position.y = 1.22;
    vest.castShadow = true;
    this.bodyPivot.add(vest);

    for (const px of [-0.14, 0, 0.14]) {
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.05), vestMat);
      pouch.position.set(px, 1.1, -0.17);
      this.bodyPivot.add(pouch);
    }

    // Sculpted Rounded Head + PASGT Helmet / Mercenary Headgear
    this.headGroup.position.set(0, 1.54, 0);
    this.bodyPivot.add(this.headGroup);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 12), skinMat);
    head.scale.set(0.94, 1.06, 0.96);
    head.position.y = 0.14;
    head.castShadow = true;
    this.headGroup.add(head);

    if (team === 'GR') {
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.178, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), headGearMat);
      helmet.position.y = 0.16;
      this.headGroup.add(helmet);

      const goggles = new THREE.Mesh(
        new THREE.BoxGeometry(0.27, 0.075, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x3b92e0, metalness: 0.85, roughness: 0.16 })
      );
      goggles.position.set(0, 0.16, -0.14);
      this.headGroup.add(goggles);
    } else {
      const bandana = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.168, 0.1, 14), headGearMat);
      bandana.position.y = 0.22;
      this.headGroup.add(bandana);

      const mask = new THREE.Mesh(new THREE.CylinderGeometry(0.156, 0.148, 0.15, 14), vestMat);
      mask.position.y = 0.08;
      this.headGroup.add(mask);
    }

    // Arms + Real Blender 5.3 High-Detail 3rd-Person Weapon!
    this.armRightPivot.position.set(0.30, 1.4, 0);
    this.armLeftPivot.position.set(-0.30, 1.4, 0);
    this.bodyPivot.add(this.armRightPivot, this.armLeftPivot);

    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.058, 0.5, 10), uniformMat);
    armR.position.set(-0.05, -0.16, -0.16);
    armR.rotation.x = Math.PI / 2.35;
    armR.castShadow = true;
    this.armRightPivot.add(armR);

    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.058, 0.5, 10), uniformMat);
    armL.position.set(0.13, -0.16, -0.2);
    armL.rotation.set(Math.PI / 2.25, -0.34, 0);
    armL.castShadow = true;
    this.armLeftPivot.add(armL);

    const thirdPersonGun = assets.createWeaponMesh(weaponId);
    thirdPersonGun.scale.setScalar(1.05);
    thirdPersonGun.position.set(-0.08, -0.16, -0.2);
    this.armRightPivot.add(thirdPersonGun);

    const gunLen = weaponId === 'barrett' ? 0.95 : weaponId === 'awm' ? 0.85 : 0.72;
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd25a })
    );
    flash.position.set(-0.08, -0.15, -0.2 - gunLen);
    flash.visible = false;
    this.armRightPivot.add(flash);
    this.muzzleFlash = flash;

    // Legs + Kneepads + Combat Boots
    this.legLeftPivot.position.set(-0.13, 0.76, 0);
    this.legRightPivot.position.set(0.13, 0.76, 0);
    this.bodyPivot.add(this.legLeftPivot, this.legRightPivot);

    for (const piv of [this.legLeftPivot, this.legRightPivot]) {
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.075, 0.62, 10), pantsMat);
      thigh.position.y = -0.31;
      thigh.castShadow = true;
      piv.add(thigh);

      const kneepad = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.06), vestMat);
      kneepad.position.set(0, -0.34, -0.08);
      piv.add(kneepad);

      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.17, 0.25), bootMat);
      boot.position.set(0, -0.67, -0.03);
      piv.add(boot);
    }

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
