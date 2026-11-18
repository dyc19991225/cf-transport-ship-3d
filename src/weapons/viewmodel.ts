import * as THREE from 'three';
import { LoadedGameAssets } from '../assets/assetManager';
import { TeamId, WeaponId } from '../types';

export class FirstPersonViewmodel {
  public readonly root = new THREE.Group();
  private readonly swayGroup = new THREE.Group();
  private readonly weaponModels: Record<WeaponId, THREE.Group>;
  private readonly muzzleFlash: THREE.Mesh;
  public readonly worldMuzzleLight = new THREE.PointLight(0xffb444, 0, 8.5, 1.8);

  private activeWeapon: WeaponId = 'ak47';
  private recoilZ = 0;
  private recoilPitch = 0;
  private drawTimer = 0;
  private drawDuration = 0.45;
  private reloadTimer = 0;
  private reloadDuration = 2.0;
  private boltTimer = 0;
  private slashTimer = 0;
  private slashHeavy = false;
  private flashTimer = 0;
  private bobPhase = 0;

  constructor(team: TeamId, assets: LoadedGameAssets) {
    this.root.add(this.swayGroup);

    const buildWithHands = (id: WeaponId, frontZ: number, oneHanded = false): THREE.Group => {
      const grp = assets.createWeaponMesh(id);
      this.addTacticalArms(grp, team, frontZ, oneHanded);
      return grp;
    };

    this.weaponModels = {
      ak47: buildWithHands('ak47', -0.28),
      m4a1s: buildWithHands('m4a1s', -0.27),
      awm: buildWithHands('awm', -0.31),
      barrett: buildWithHands('barrett', -0.33),
      deagle: buildWithHands('deagle', -0.11),
      kukri: buildWithHands('kukri', -0.13, true),
      he_grenade: buildWithHands('he_grenade', -0.16),
    };

    (Object.keys(this.weaponModels) as WeaponId[]).forEach((id) => {
      this.swayGroup.add(this.weaponModels[id]);
    });

    const flashGeo = new THREE.ConeGeometry(0.062, 0.22, 7);
    flashGeo.rotateX(-Math.PI / 2);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffdc73,
      transparent: true,
      opacity: 0.92,
    });
    this.muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlash.visible = false;
    this.swayGroup.add(this.muzzleFlash);

    this.worldMuzzleLight.position.set(0.18, -0.1, -0.75);
    this.equip('ak47', 0.45);
  }

  private addTacticalArms(g: THREE.Group, team: TeamId, frontZ: number, oneHanded: boolean): void {
    const sleeveMat = new THREE.MeshStandardMaterial({
      color: team === 'GR' ? 0x26405c : 0x9b7c54,
      roughness: 0.76,
    });
    const cuffMat = new THREE.MeshStandardMaterial({ color: 0x161a20, roughness: 0.65 });
    const gloveMat = new THREE.MeshStandardMaterial({ color: 0x1a1e24, roughness: 0.56, metalness: 0.16 });

    if (!oneHanded) {
      const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.32, 12), sleeveMat);
      armL.position.set(-0.088, -0.155, frontZ + 0.16);
      armL.rotation.set(Math.PI / 2 + 0.36, 0.38, 0);
      g.add(armL);

      const handL = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.046, 0.088), gloveMat);
      handL.position.set(-0.008, -0.028, frontZ);
      g.add(handL);
    }

    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.039, 0.28, 12), sleeveMat);
    armR.position.set(oneHanded ? 0.045 : 0.032, -0.125, oneHanded ? -0.01 : 0.14);
    armR.rotation.set(Math.PI / 2 + 0.2, -0.12, 0);
    g.add(armR);

    const cuffR = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.03, 12), cuffMat);
    cuffR.position.set(oneHanded ? 0.028 : 0.012, -0.085, oneHanded ? -0.10 : 0.04);
    cuffR.rotation.set(Math.PI / 2 + 0.2, -0.12, 0);
    g.add(cuffR);

    const handR = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), gloveMat);
    handR.scale.set(0.95, 0.85, 1.2);
    handR.position.set(oneHanded ? 0.02 : 0.0, oneHanded ? -0.058 : -0.072, oneHanded ? -0.135 : 0.015);
    g.add(handR);
  }

  public setScopedHidden(scoped: boolean): void {
    this.swayGroup.visible = !scoped;
  }

  public equip(id: WeaponId, drawDuration: number): void {
    this.activeWeapon = id;
    this.drawDuration = Math.max(0.2, drawDuration);
    this.drawTimer = this.drawDuration;
    this.reloadTimer = 0;
    this.slashTimer = 0;
    this.boltTimer = 0;
    (Object.keys(this.weaponModels) as WeaponId[]).forEach((k) => {
      this.weaponModels[k].visible = k === id;
    });
  }

  public triggerFire(suppressed = false, boltTime = 0): void {
    this.recoilZ = Math.min(0.1, this.recoilZ + 0.052);
    this.recoilPitch = Math.min(0.18, this.recoilPitch + 0.068);
    if (!suppressed) {
      this.flashTimer = 0.048;
      this.muzzleFlash.visible = true;
      this.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
      const zMuzzle = this.activeWeapon === 'barrett' ? -0.96 : this.activeWeapon === 'deagle' ? -0.35 : -0.78;
      this.muzzleFlash.position.set(0, 0.012, zMuzzle);
      this.worldMuzzleLight.intensity = 6.5;
    } else {
      this.flashTimer = 0.02;
      this.worldMuzzleLight.intensity = 1.2;
    }
    if (boltTime > 0) {
      this.boltTimer = boltTime;
    }
  }

  public triggerSlash(heavy: boolean): void {
    this.slashHeavy = heavy;
    this.slashTimer = heavy ? 0.44 : 0.26;
  }

  public triggerReload(duration: number): void {
    this.reloadDuration = duration;
    this.reloadTimer = duration;
  }

  public update(dt: number, moveSpeed: number, grounded: boolean, lookDeltaX: number, lookDeltaY: number): void {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.muzzleFlash.visible = false;
        this.worldMuzzleLight.intensity = 0;
      }
    }

    this.recoilZ = THREE.MathUtils.lerp(this.recoilZ, 0, Math.min(1, dt * 15));
    this.recoilPitch = THREE.MathUtils.lerp(this.recoilPitch, 0, Math.min(1, dt * 13));

    if (grounded && moveSpeed > 0.35) {
      this.bobPhase += dt * (5.8 + moveSpeed * 1.15);
    } else {
      this.bobPhase += dt * 1.4;
    }
    const bobAmp = grounded && moveSpeed > 0.35 ? Math.min(0.014, moveSpeed * 0.0022) : 0.0022;
    const bobX = Math.cos(this.bobPhase) * bobAmp;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * bobAmp * 1.25;

    let posX = 0.21 + bobX - THREE.MathUtils.clamp(lookDeltaX * 0.00038, -0.024, 0.024);
    let posY = -0.19 - bobY + THREE.MathUtils.clamp(lookDeltaY * 0.00038, -0.024, 0.024);
    let posZ = -0.36 + this.recoilZ;
    let rotX = this.recoilPitch;
    let rotY = -0.04;
    let rotZ = 0;

    if (this.drawTimer > 0) {
      this.drawTimer = Math.max(0, this.drawTimer - dt);
      const p = this.drawTimer / this.drawDuration;
      if (this.activeWeapon === 'kukri') {
        rotX -= p * Math.PI * 1.6;
        posY -= p * 0.14;
      } else {
        posY -= p * 0.24;
        rotX -= p * 0.55;
      }
    }

    if (this.reloadTimer > 0) {
      this.reloadTimer = Math.max(0, this.reloadTimer - dt);
      const p = 1 - this.reloadTimer / this.reloadDuration;
      const dip = Math.sin(p * Math.PI);
      rotZ += dip * 0.5;
      rotX -= dip * 0.34;
      posY -= dip * 0.1;
    }

    if (this.boltTimer > 0) {
      this.boltTimer = Math.max(0, this.boltTimer - dt);
      const b = Math.sin(this.boltTimer * Math.PI * 1.4);
      rotZ += b * 0.22;
      posY -= Math.abs(b) * 0.03;
    }

    if (this.slashTimer > 0) {
      this.slashTimer = Math.max(0, this.slashTimer - dt);
      const dur = this.slashHeavy ? 0.44 : 0.26;
      const p = 1 - this.slashTimer / dur;
      const swing = Math.sin(p * Math.PI);
      if (this.slashHeavy) {
        posZ -= swing * 0.25;
        posX -= swing * 0.18;
        rotY += swing * 0.95;
        rotX -= swing * 0.65;
      } else {
        posX -= swing * 0.22;
        posZ -= swing * 0.14;
        rotZ += swing * 0.85;
        rotY += swing * 0.65;
      }
    }

    this.swayGroup.position.set(posX, posY, posZ);
    this.swayGroup.rotation.set(rotX, rotY, rotZ);
  }
}
