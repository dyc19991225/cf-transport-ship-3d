import * as THREE from 'three';
import { CollisionWorld } from '../physics/collisionWorld';
import { SoundEngine } from '../audio/soundEngine';
import { MaterialType, TeamId } from '../types';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
  spin: boolean;
}

interface Tracer {
  line: THREE.Line;
  mat: THREE.LineBasicMaterial;
  life: number;
}

interface ThrownGrenade {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fuse: number;
  ownerId: string;
  ownerTeam: TeamId;
}

interface ExplosionWave {
  sphere: THREE.Mesh;
  ring: THREE.Mesh;
  light: THREE.PointLight;
  life: number;
  maxLife: number;
}

export interface BlastCallbackPayload {
  pos: THREE.Vector3;
  ownerId: string;
  ownerTeam: TeamId;
}

export class CombatEffects {
  private readonly scene: THREE.Scene;
  private readonly particles: Particle[] = [];
  private readonly tracers: Tracer[] = [];
  private readonly decals: THREE.Mesh[] = [];
  private readonly grenades: ThrownGrenade[] = [];
  private readonly explosions: ExplosionWave[] = [];

  private readonly sparkGeo = new THREE.BoxGeometry(0.035, 0.035, 0.09);
  private readonly splinterGeo = new THREE.BoxGeometry(0.03, 0.025, 0.12);
  private readonly bloodGeo = new THREE.SphereGeometry(0.048, 6, 6);
  private readonly shellGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.038, 6);
  private readonly decalGeo = new THREE.CircleGeometry(0.048, 8);

  private readonly sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc84a });
  private readonly splinterMat = new THREE.MeshLambertMaterial({ color: 0xc99658 });
  private readonly bloodMat = new THREE.MeshBasicMaterial({ color: 0xb81414 });
  private readonly shellMat = new THREE.MeshStandardMaterial({ color: 0xe3b43c, metalness: 0.85, roughness: 0.25 });
  private readonly metalHoleMat = new THREE.MeshBasicMaterial({
    color: 0x121518,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  private readonly woodHoleMat = new THREE.MeshBasicMaterial({
    color: 0x3b220c,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public spawnTracer(start: THREE.Vector3, end: THREE.Vector3, color = 0xffe28a): void {
    const pts = [start.clone(), end.clone()];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.72 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, mat, life: 0.075 });
  }

  public spawnShellCasing(origin: THREE.Vector3, rightDir: THREE.Vector3, upDir: THREE.Vector3): void {
    const mesh = new THREE.Mesh(this.shellGeo, this.shellMat);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    const vel = rightDir
      .clone()
      .multiplyScalar(1.9 + Math.random() * 0.9)
      .addScaledVector(upDir, 1.5 + Math.random() * 0.8);
    this.particles.push({
      mesh,
      vel,
      life: 0.75,
      maxLife: 0.75,
      gravity: 13.5,
      spin: true,
    });
  }

  public spawnImpact(point: THREE.Vector3, normal: THREE.Vector3, material: MaterialType): void {
    // Bullet hole decal
    if (normal.lengthSq() > 0.2) {
      const hole = new THREE.Mesh(this.decalGeo, material === 'wood' ? this.woodHoleMat : this.metalHoleMat);
      hole.position.copy(point).addScaledVector(normal, 0.008);
      hole.lookAt(point.clone().add(normal));
      this.scene.add(hole);
      this.decals.push(hole);
      if (this.decals.length > 90) {
        const old = this.decals.shift()!;
        this.scene.remove(old);
      }
    }

    // Debris / sparks burst
    const count = material === 'wood' ? 6 : 7;
    for (let i = 0; i < count; i++) {
      const isWood = material === 'wood';
      const mesh = new THREE.Mesh(
        isWood ? this.splinterGeo : this.sparkGeo,
        isWood ? this.splinterMat : this.sparkMat
      );
      mesh.position.copy(point).addScaledVector(normal, 0.03);
      this.scene.add(mesh);

      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 3.4,
        Math.random() * 2.6,
        (Math.random() - 0.5) * 3.4
      ).addScaledVector(normal, 2.4 + Math.random() * 2.2);

      this.particles.push({
        mesh,
        vel: spread,
        life: isWood ? 0.38 : 0.24,
        maxLife: isWood ? 0.38 : 0.24,
        gravity: 14,
        spin: isWood,
      });
    }
  }

  public spawnBloodBurst(point: THREE.Vector3, headshot: boolean): void {
    const count = headshot ? 12 : 6;
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        this.bloodGeo,
        headshot && i % 3 === 0 ? this.sparkMat : this.bloodMat
      );
      mesh.position.copy(point);
      this.scene.add(mesh);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 3.8,
        0.8 + Math.random() * 2.6,
        (Math.random() - 0.5) * 3.8
      );
      this.particles.push({
        mesh,
        vel,
        life: 0.34,
        maxLife: 0.34,
        gravity: 11,
        spin: false,
      });
    }
  }

  public throwGrenade(
    origin: THREE.Vector3,
    velocity: THREE.Vector3,
    ownerId: string,
    ownerTeam: TeamId
  ): void {
    const g = new THREE.Group();
    const can = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.065, 0.16, 10),
      new THREE.MeshStandardMaterial({ color: 0x2e4629, roughness: 0.5 })
    );
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.068, 0.035, 10),
      new THREE.MeshBasicMaterial({ color: 0xff3b28 })
    );
    g.add(can, band);
    g.position.copy(origin);
    this.scene.add(g);

    this.grenades.push({
      mesh: g,
      pos: origin.clone(),
      vel: velocity.clone(),
      fuse: 2.05,
      ownerId,
      ownerTeam,
    });
  }

  public update(
    dt: number,
    collision: CollisionWorld,
    sound: SoundEngine,
    listenerPos: THREE.Vector3,
    onDetonate: (payload: BlastCallbackPayload) => void
  ): void {
    // 1. Tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      tr.mat.opacity = Math.max(0, (tr.life / 0.075) * 0.72);
      if (tr.life <= 0) {
        this.scene.remove(tr.line);
        tr.line.geometry.dispose();
        tr.mat.dispose();
        this.tracers.splice(i, 1);
      }
    }

    // 2. Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.spin) {
        p.mesh.rotation.x += dt * 14;
        p.mesh.rotation.z += dt * 11;
      } else {
        p.mesh.lookAt(p.mesh.position.clone().add(p.vel));
      }
      const s = Math.max(0.05, p.life / p.maxLife);
      p.mesh.scale.setScalar(s);
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }

    // 3. Thrown HE Grenades
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const gr = this.grenades[i];
      gr.fuse -= dt;
      const step = collision.stepGrenade(gr.pos, gr.vel, dt, 0.12);
      gr.mesh.position.copy(gr.pos);
      gr.mesh.rotation.x += dt * 9;
      gr.mesh.rotation.z += dt * 7;

      if (step.bounced) {
        const dist = gr.pos.distanceTo(listenerPos);
        sound.playImpact(step.material, 0, Math.max(0.08, 1 - dist / 38) * 0.45);
      }

      if (gr.fuse <= 0) {
        this.scene.remove(gr.mesh);
        this.spawnExplosionVisual(gr.pos);
        onDetonate({
          pos: gr.pos.clone(),
          ownerId: gr.ownerId,
          ownerTeam: gr.ownerTeam,
        });
        this.grenades.splice(i, 1);
      }
    }

    // 4. Explosion Shockwaves
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.life -= dt;
      const p = 1 - ex.life / ex.maxLife;
      const rad = 0.6 + p * 5.2;
      ex.sphere.scale.setScalar(rad);
      (ex.sphere.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1 - p) * 0.78);
      ex.ring.scale.setScalar(0.8 + p * 6.5);
      (ex.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1 - p) * 0.85);
      ex.light.intensity = (1 - p) * 18;

      if (ex.life <= 0) {
        this.scene.remove(ex.sphere, ex.ring, ex.light);
        (ex.sphere.material as THREE.Material).dispose();
        (ex.ring.material as THREE.Material).dispose();
        this.explosions.splice(i, 1);
      }
    }
  }

  private spawnExplosionVisual(pos: THREE.Vector3): void {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff8c24, transparent: true, opacity: 0.82 })
    );
    sphere.position.copy(pos);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.65, 1.0, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd268, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, pos.y + 0.08, pos.z);

    const light = new THREE.PointLight(0xff9428, 18, 22, 1.5);
    light.position.copy(pos).add(new THREE.Vector3(0, 0.6, 0));

    this.scene.add(sphere, ring, light);
    this.explosions.push({ sphere, ring, light, life: 0.42, maxLife: 0.42 });

    // Shrapnel sparks
    for (let i = 0; i < 22; i++) {
      const m = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      m.position.copy(pos);
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 14, 2 + Math.random() * 9, (Math.random() - 0.5) * 14),
        life: 0.55,
        maxLife: 0.55,
        gravity: 15,
        spin: true,
      });
    }
  }
}
