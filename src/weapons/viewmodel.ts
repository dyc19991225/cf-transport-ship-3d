import * as THREE from 'three';
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

  constructor(team: TeamId) {
    this.root.add(this.swayGroup);

    this.weaponModels = {
      ak47: this.buildAK47(team),
      m4a1s: this.buildM4A1S(team),
      awm: this.buildAWM(team),
      barrett: this.buildBarrett(team),
      deagle: this.buildDeagle(team),
      kukri: this.buildKukri(team),
      he_grenade: this.buildGrenade(team),
    };

    (Object.keys(this.weaponModels) as WeaponId[]).forEach((id) => {
      this.swayGroup.add(this.weaponModels[id]);
    });

    // 3D Starburst Muzzle Flash (properly Z-buffered inside dedicated weaponScene)
    const flashGeo = new THREE.ConeGeometry(0.062, 0.2, 6);
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
      const zMuzzle = this.activeWeapon === 'barrett' ? -0.96 : this.activeWeapon === 'deagle' ? -0.44 : -0.76;
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

  private mats(team: TeamId) {
    return {
      sleeve: new THREE.MeshStandardMaterial({
        color: team === 'GR' ? 0x263f59 : 0x9b7c54,
        roughness: 0.78,
      }),
      glove: new THREE.MeshStandardMaterial({ color: 0x1a1e24, roughness: 0.62, metalness: 0.12 }),
      gunMetal: new THREE.MeshStandardMaterial({ color: 0x2c323a, roughness: 0.34, metalness: 0.82 }),
      darkSteel: new THREE.MeshStandardMaterial({ color: 0x181c21, roughness: 0.38, metalness: 0.78 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xd8e0e8, roughness: 0.18, metalness: 0.95 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xe6ad32, roughness: 0.25, metalness: 0.9 }),
      redWood: new THREE.MeshStandardMaterial({ color: 0x852d1a, roughness: 0.48, metalness: 0.15 }),
      olive: new THREE.MeshStandardMaterial({ color: 0x3e5e38, roughness: 0.52, metalness: 0.2 }),
      camo: new THREE.MeshStandardMaterial({ color: 0x415647, roughness: 0.48, metalness: 0.32 }),
      lens: new THREE.MeshStandardMaterial({ color: 0x2b78c2, roughness: 0.1, metalness: 0.92 }),
    };
  }

  private addHands(g: THREE.Group, team: TeamId, frontZ = -0.26): void {
    const m = this.mats(team);
    // Support left forearm & gloved hand gripping forend
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.062, 0.32), m.sleeve);
    armL.position.set(-0.085, -0.105, frontZ + 0.15);
    armL.rotation.set(0.22, 0.34, 0);
    g.add(armL);

    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.052, 0.082), m.glove);
    handL.position.set(-0.012, -0.048, frontZ);
    g.add(handL);

    // Trigger right forearm & hand on pistol grip
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.064, 0.26), m.sleeve);
    armR.position.set(0.032, -0.12, 0.15);
    armR.rotation.set(0.2, -0.1, 0);
    g.add(armR);

    const handR = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.058, 0.078), m.glove);
    handR.position.set(0.0, -0.072, 0.02);
    g.add(handR);
  }

  private buildAK47(team: TeamId): THREE.Group {
    const g = new THREE.Group();
    const m = this.mats(team);

    // Stamped steel receiver + dust cover + pistol grip
    const rec = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.072, 0.28), m.gunMetal);
    rec.position.set(0, 0, -0.05);
    g.add(rec);

    const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.25, 10), m.darkSteel);
    cover.rotation.x = Math.PI / 2;
    cover.position.set(0, 0.036, -0.04);
    g.add(cover);

    // Fire-Kirin Golden Dragon Spine & Scale Crest
    const goldCrest = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.014, 0.24), m.gold);
    goldCrest.position.set(0, 0.046, -0.06);
    g.add(goldCrest);

    const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.1, 0.046), m.redWood);
    pGrip.position.set(0, -0.075, 0.03);
    pGrip.rotation.x = 0.28;
    g.add(pGrip);

    // Wooden handguard + upper gas cover
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.058, 0.21), m.redWood);
    guard.position.set(0, 0.004, -0.295);
    g.add(guard);

    const goldFerrule = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.062, 0.025), m.gold);
    goldFerrule.position.set(0, 0.004, -0.39);
    g.add(goldFerrule);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.078, 0.2), m.redWood);
    stock.position.set(0, -0.028, 0.18);
    stock.rotation.x = -0.14;
    g.add(stock);

    // Rifled barrel + gas block + iconic AK front sight ears + slant brake
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.3, 12), m.darkSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.008, -0.53);
    g.add(barrel);

    const gas = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.17, 10), m.gunMetal);
    gas.rotation.x = Math.PI / 2;
    gas.position.set(0, 0.03, -0.45);
    g.add(gas);

    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.042, 0.022), m.darkSteel);
    frontSight.position.set(0, 0.034, -0.64);
    g.add(frontSight);

    // Curved 2-segment AK-47 banana magazine
    const magTop = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.1, 0.062), m.redWood);
    magTop.position.set(0, -0.082, -0.14);
    magTop.rotation.x = 0.2;
    g.add(magTop);

    const magBot = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.1, 0.06), m.gold);
    magBot.position.set(0, -0.165, -0.17);
    magBot.rotation.x = 0.44;
    g.add(magBot);

    this.addHands(g, team, -0.28);
    return g;
  }

  private buildM4A1S(team: TeamId): THREE.Group {
    const g = new THREE.Group();
    const m = this.mats(team);

    const rec = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.076, 0.27), m.camo);
    rec.position.set(0, 0, -0.05);
    g.add(rec);

    // Classic M4A1 Carry Handle + Rear Aperture Sight
    const handleTop = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.016, 0.15), m.darkSteel);
    handleTop.position.set(0, 0.062, -0.04);
    g.add(handleTop);
    for (const hz of [-0.1, 0.02]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.026, 0.02), m.darkSteel);
      post.position.set(0, 0.046, hz);
      g.add(post);
    }

    const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.1, 0.046), m.darkSteel);
    pGrip.position.set(0, -0.075, 0.03);
    pGrip.rotation.x = 0.25;
    g.add(pGrip);

    const handguard = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.22, 12), m.camo);
    handguard.rotation.x = Math.PI / 2;
    handguard.position.set(0, 0.008, -0.29);
    g.add(handguard);

    // Iconic M4 Triangle Front Sight Post
    const triSight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.048, 0.03), m.darkSteel);
    triSight.position.set(0, 0.042, -0.41);
    triSight.rotation.x = -0.2;
    g.add(triSight);

    // Long Matte-Black Suppressed Barrel ("M4A1-S 消音管")
    const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.26, 16), m.darkSteel);
    suppressor.rotation.x = Math.PI / 2;
    suppressor.position.set(0, 0.008, -0.56);
    g.add(suppressor);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.15, 0.06), m.gunMetal);
    mag.position.set(0, -0.1, -0.13);
    mag.rotation.x = 0.16;
    g.add(mag);

    this.addHands(g, team, -0.27);
    return g;
  }

  private buildAWM(team: TeamId): THREE.Group {
    const g = new THREE.Group();
    const m = this.mats(team);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.076, 0.54), m.olive);
    body.position.set(0, -0.008, -0.14);
    g.add(body);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.44, 14), m.darkSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.016, -0.58);
    g.add(barrel);

    const muzzleBrake = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.028, 0.055), m.gunMetal);
    muzzleBrake.position.set(0, 0.016, -0.8);
    g.add(muzzleBrake);

    // Sniper Scope with Blue-Coated Optical Lens!
    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.26, 14), m.darkSteel);
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.068, -0.12);
    g.add(scopeTube);

    const bellRear = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.018, 0.055, 14), m.darkSteel);
    bellRear.rotation.x = Math.PI / 2;
    bellRear.position.set(0, 0.068, 0.02);
    g.add(bellRear);

    const lensRear = new THREE.Mesh(new THREE.CircleGeometry(0.02, 14), m.lens);
    lensRear.position.set(0, 0.068, 0.049);
    g.add(lensRear);

    const bellFront = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.019, 0.065, 14), m.darkSteel);
    bellFront.rotation.x = Math.PI / 2;
    bellFront.position.set(0, 0.068, -0.26);
    g.add(bellFront);

    const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.012, 0.012), m.chrome);
    bolt.position.set(0.038, 0.022, -0.02);
    g.add(bolt);

    this.addHands(g, team, -0.31);
    return g;
  }

  private buildBarrett(team: TeamId): THREE.Group {
    const g = new THREE.Group();
    const m = this.mats(team);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.092, 0.62), m.gunMetal);
    body.position.set(0, -0.005, -0.18);
    g.add(body);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.44, 14), m.darkSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.014, -0.66);
    g.add(barrel);

    // Iconic Arrowhead .50 BMG Muzzle Brake
    const brake = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.044, 0.088), m.darkSteel);
    brake.position.set(0, 0.014, -0.9);
    g.add(brake);

    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 14), m.darkSteel);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.082, -0.15);
    g.add(scope);

    const lensRear = new THREE.Mesh(new THREE.CircleGeometry(0.02, 14), m.lens);
    lensRear.position.set(0, 0.082, 0.002);
    g.add(lensRear);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.15, 0.105), m.darkSteel);
    mag.position.set(0, -0.11, -0.18);
    mag.rotation.x = 0.14;
    g.add(mag);

    this.addHands(g, team, -0.33);
    return g;
  }

  private buildDeagle(team: TeamId): THREE.Group {
    const g = new THREE.Group();
    const m = this.mats(team);

    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.054, 0.22), m.chrome);
    slide.position.set(0, 0.02, -0.18);
    g.add(slide);

    const topRib = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.01, 0.21), m.darkSteel);
    topRib.position.set(0, 0.048, -0.18);
    g.add(topRib);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.115, 0.056), m.darkSteel);
    grip.position.set(0, -0.052, -0.09);
    grip.rotation.x = 0.24;
    g.add(grip);

    this.addHands(g, team, -0.11);
    return g;
  }

  private buildKukri(team: TeamId): THREE.Group {
    const g = new THREE.Group();
    const m = this.mats(team);

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, 0.13, 12), m.redWood);
    handle.position.set(0.02, -0.05, -0.14);
    handle.rotation.x = 0.35;
    g.add(handle);

    const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.018, 0.02, 12), m.gold);
    pommel.position.set(0.02, -0.11, -0.118);
    pommel.rotation.x = 0.35;
    g.add(pommel);

    const bolster = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.018, 0.03), m.gold);
    bolster.position.set(0.02, 0.01, -0.17);
    g.add(bolster);

    const blade1 = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.14, 0.046), m.chrome);
    blade1.position.set(0.02, 0.075, -0.195);
    blade1.rotation.x = 0.38;
    g.add(blade1);

    const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.155, 0.058), m.chrome);
    blade2.position.set(0.02, 0.175, -0.255);
    blade2.rotation.x = 0.72;
    g.add(blade2);

    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.064, 0.26), m.sleeve);
    armR.position.set(0.045, -0.125, -0.01);
    armR.rotation.set(0.22, -0.15, 0);
    g.add(armR);

    const handR = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.055, 0.075), m.glove);
    handR.position.set(0.02, -0.06, -0.13);
    g.add(handR);

    return g;
  }

  private buildGrenade(team: TeamId): THREE.Group {
    const g = new THREE.Group();
    const m = this.mats(team);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.11, 16), m.olive);
    body.position.set(0, -0.01, -0.18);
    g.add(body);

    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.043, 0.043, 0.022, 16),
      new THREE.MeshBasicMaterial({ color: 0xe63b2e })
    );
    stripe.position.set(0, 0.01, -0.18);
    g.add(stripe);

    const fuze = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.035, 12), m.chrome);
    fuze.position.set(0, 0.06, -0.18);
    g.add(fuze);

    this.addHands(g, team, -0.16);
    return g;
  }
}
