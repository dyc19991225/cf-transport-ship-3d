import * as THREE from 'three';
import { LoadedGameAssets } from '../assets/assetManager';
import { CollisionWorld } from '../physics/collisionWorld';
import { MaterialType, TeamId, WayNode } from '../types';

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface BuiltShipWorld {
  spawns: Record<TeamId, SpawnPoint[]>;
  wayNodes: WayNode[];
  updateEnvironment: (timeSec: number) => void;
  minimapContainers: Array<{ x: number; z: number; w: number; d: number; color: string }>;
}

export function buildTransportShip(
  scene: THREE.Scene,
  collision: CollisionWorld,
  assets: LoadedGameAssets
): BuiltShipWorld {
  collision.clear();
  const root = new THREE.Group();
  root.name = 'TransportShipRoot';
  scene.add(root);

  const minimapContainers: Array<{ x: number; z: number; w: number; d: number; color: string }> = [];

  let boxCounter = 0;
  const addBox = (
    cx: number,
    minY: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material | THREE.Material[],
    opts: {
      collide?: boolean;
      visual?: boolean;
      material?: MaterialType;
      penetrable?: boolean;
      castShadow?: boolean;
      receiveShadow?: boolean;
      noStepUp?: boolean;
      minimapColor?: string;
    } = {}
  ): THREE.Mesh | null => {
    let mesh: THREE.Mesh | null = null;
    if (opts.visual !== false) {
      const geo = new THREE.BoxGeometry(w, h, d);
      mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cx, minY + h / 2, cz);
      mesh.castShadow = opts.castShadow ?? true;
      mesh.receiveShadow = opts.receiveShadow ?? true;
      root.add(mesh);
    }

    if (opts.collide !== false) {
      collision.addBox({
        id: `box_${++boxCounter}`,
        minX: cx - w / 2,
        maxX: cx + w / 2,
        minY,
        maxY: minY + h,
        minZ: cz - d / 2,
        maxZ: cz + d / 2,
        material: opts.material ?? 'steel',
        penetrable: opts.penetrable ?? false,
        noStepUp: opts.noStepUp,
      });
    }

    if (opts.minimapColor) {
      minimapContainers.push({ x: cx, z: cz, w, d, color: opts.minimapColor });
    }
    return mesh;
  };

  // Spawn High-Detail Blender 5.3 ISO Shipping Container + Exact Physics AABB
  const addShippingContainer = (
    cx: number,
    minY: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    color: 'red' | 'blue' | 'green' | 'yellow' | 'orange',
    alongZ = true,
    showOnMinimap = true
  ): void => {
    const glbContainer = assets.createISOContainerMesh(w, h, d, color, alongZ);
    glbContainer.position.set(cx, minY, cz);
    root.add(glbContainer);

    const mapHex: Record<typeof color, string> = {
      red: '#b63b34',
      blue: '#2d6da8',
      green: '#387d4e',
      yellow: '#cfa030',
      orange: '#c66530',
    };

    addBox(cx, minY, cz, w, h, d, assets.hullDarkMat, {
      visual: false,
      collide: true,
      material: 'container',
      penetrable: false,
      noStepUp: true,
      minimapColor: showOnMinimap ? mapHex[color] : undefined,
    });
  };

  // Spawn High-Detail Blender 5.3 Penetrable Wooden Crate ("可穿透木箱") + Exact Wallbang AABB
  const addWoodCrate = (cx: number, minY: number, cz: number, w: number, h: number, d: number, stepable = false): void => {
    const glbCrate = assets.createWoodCrateMesh(w, h, d);
    glbCrate.position.set(cx, minY, cz);
    root.add(glbCrate);

    addBox(cx, minY, cz, w, h, d, assets.hullDarkMat, {
      visual: false,
      collide: true,
      material: 'wood',
      penetrable: true,
      noStepUp: !stepable && h > 0.55,
      minimapColor: '#b98b50',
    });
  };

  // =========================================================================
  // 1. MAIN ANTI-SLIP STEEL DECK SLABS (AI PBR Texture + Bump + Cutouts for 4 Ramps)
  // =========================================================================
  const deckThickness = 0.36;
  addBox(0, -deckThickness, 0, 26.4, deckThickness, 88.0, assets.deckMat, {
    material: 'steel',
    castShadow: false,
  });

  for (const sx of [-1, 1]) {
    const stripCx = sx * 14.8;
    addBox(stripCx, -deckThickness, 33.25, 3.2, deckThickness, 21.5, assets.deckMat, {
      material: 'steel',
      castShadow: false,
    });
    addBox(stripCx, -deckThickness, -33.25, 3.2, deckThickness, 21.5, assets.deckMat, {
      material: 'steel',
      castShadow: false,
    });
    addBox(stripCx, -deckThickness, 0, 3.2, deckThickness, 31.0, assets.deckMat, {
      material: 'steel',
      castShadow: false,
    });
    addBox(sx * 16.65, -deckThickness, 0, 0.5, deckThickness, 88.0, assets.deckMat, {
      material: 'steel',
      castShadow: false,
    });
  }

  // Painted yellow tactical deck lane markings
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xe3aa2b, transparent: true, opacity: 0.52 });
  for (const lx of [-12.9, 12.9]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 76), lineMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(lx, 0.008, 0);
    root.add(strip);
  }
  const midLine = new THREE.Mesh(new THREE.PlaneGeometry(25.5, 0.18), lineMat);
  midLine.rotation.x = -Math.PI / 2;
  midLine.position.set(0, 0.008, 0);
  root.add(midLine);

  // =========================================================================
  // 2. DUAL FLANKING UNDERGROUND TUNNELS ("两侧地下暗道 / 下水道", Y = -3.2m)
  // =========================================================================
  for (const sx of [-1, 1]) {
    const tunCx = sx * 14.8;

    addBox(tunCx, -3.55, 0, 3.4, 0.35, 45.2, assets.bunkerFloorMat, {
      material: 'steel',
      castShadow: false,
    });

    addBox(sx * 13.08, -3.2, 0, 0.24, 3.2, 45.2, assets.tunnelWallMat, {
      material: 'steel',
      castShadow: false,
    });
    addBox(sx * 16.52, -3.2, 0, 0.24, 3.2, 45.2, assets.tunnelWallMat, {
      material: 'steel',
      castShadow: false,
    });

    addBox(tunCx, -3.2, 22.6, 3.4, 3.2, 0.24, assets.tunnelWallMat, { material: 'steel', castShadow: false });
    addBox(tunCx, -3.2, -22.6, 3.4, 3.2, 0.24, assets.tunnelWallMat, { material: 'steel', castShadow: false });

    collision.addRamp({
      id: `tunnel_ramp_south_${sx}`,
      minX: Math.min(sx * 13.2, sx * 16.4),
      maxX: Math.max(sx * 13.2, sx * 16.4),
      minZ: 15.5,
      maxZ: 22.5,
      axis: 'z',
      yAtMin: -3.2,
      yAtMax: 0.0,
      thickness: 0.65,
      material: 'steel',
    });
    buildVisualRampStairs(root, tunCx, 15.5, 22.5, -3.2, 0.0, 3.16, assets.sniperGrateMat);

    collision.addRamp({
      id: `tunnel_ramp_north_${sx}`,
      minX: Math.min(sx * 13.2, sx * 16.4),
      maxX: Math.max(sx * 13.2, sx * 16.4),
      minZ: -22.5,
      maxZ: -15.5,
      axis: 'z',
      yAtMin: 0.0,
      yAtMax: -3.2,
      thickness: 0.65,
      material: 'steel',
    });
    buildVisualRampStairs(root, tunCx, -22.5, -15.5, 0.0, -3.2, 3.16, assets.sniperGrateMat);

    for (const sz of [-1, 1]) {
      addBox(sx * 13.08, 0, sz * 18.65, 0.22, 1.04, 6.3, assets.hazardMat, {
        material: 'steel',
        noStepUp: true,
      });
    }

    // Subterranean wooden crates inside tunnel
    addWoodCrate(tunCx - sx * 0.65, -3.2, 6.2 * sx, 1.15, 1.28, 1.15);
    addWoodCrate(tunCx + sx * 0.65, -3.2, -6.2 * sx, 1.15, 1.28, 1.15);

    // High-Detail Blender 5.3 Tunnel Ceiling Pipework, Valve Wheels & Caged Lamps!
    for (const lz of [-11.5, 0, 11.5]) {
      const pipeSeg = assets.createShipProp('TunnelPipeSegment');
      pipeSeg.position.set(tunCx, -3.2, lz);
      if (sx < 0) pipeSeg.rotation.y = Math.PI;
      root.add(pipeSeg);

      if (lz === 0) {
        const ptLight = new THREE.PointLight(0xffa43b, 6.5, 18, 1.5);
        ptLight.position.set(tunCx, -0.75, 0);
        root.add(ptLight);
      }
    }
  }

  // =========================================================================
  // 3. PERIMETER SHIP BULWARK WALLS (AI Concrete + Riveted Steel Wainscot)
  // =========================================================================
  const wallH = 5.4;
  addBox(-17.05, -0.35, 0, 0.5, wallH, 88.6, assets.bunkerWallMat, { material: 'steel', noStepUp: true });
  addBox(17.05, -0.35, 0, 0.5, wallH, 88.6, assets.bunkerWallMat, { material: 'steel', noStepUp: true });
  addBox(0, -0.35, 44.05, 34.6, wallH, 0.5, assets.bunkerWallMat, { material: 'concrete', noStepUp: true });
  addBox(0, -0.35, -44.05, 34.6, wallH, 0.5, assets.bunkerWallMat, { material: 'concrete', noStepUp: true });

  // =========================================================================
  // 4. 180-DEGREE POINT-SYMMETRIC SPAWN BUNKERS, SNIPER TOWERS & COURTYARDS
  // =========================================================================
  for (const s of [1, -1] as const) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(25.0, 0.04, 9.5), assets.bunkerFloorMat);
    pad.position.set(0, 0.02, s * 39.0);
    pad.receiveShadow = true;
    root.add(pad);

    addBox(-12.6, 0, s * 39.0, 0.45, 4.3, 9.6, assets.bunkerWallMat, { material: 'concrete', noStepUp: true });
    addBox(12.6, 0, s * 39.0, 0.45, 4.3, 9.6, assets.bunkerWallMat, { material: 'concrete', noStepUp: true });

    addBox(-11.1, 0, s * 34.2, 3.0, 4.3, 0.5, assets.bunkerWallMat, { material: 'concrete', noStepUp: true });
    addBox(0, 0, s * 34.2, 7.2, 4.3, 0.5, assets.bunkerWallMat, { material: 'concrete', noStepUp: true });
    addBox(11.1, 0, s * 34.2, 3.0, 4.3, 0.5, assets.bunkerWallMat, { material: 'concrete', noStepUp: true });
    addBox(-6.6, 3.25, s * 34.2, 6.0, 1.05, 0.5, assets.bunkerWallMat, { material: 'concrete', noStepUp: true });
    addBox(6.6, 3.25, s * 34.2, 6.0, 1.05, 0.5, assets.bunkerWallMat, { material: 'concrete', noStepUp: true });

    addBox(0, 4.3, s * 39.0, 25.6, 0.4, 10.1, assets.bunkerWallMat, { material: 'concrete', noStepUp: true });

    const signBanner = makeFactionSignMesh(s === 1 ? 'GR' : 'BL');
    signBanner.position.set(0, 2.35, s * 33.92);
    if (s === 1) signBanner.rotation.y = Math.PI;
    root.add(signBanner);

    const innerBanner = makeFactionSignMesh(s === 1 ? 'GR' : 'BL');
    innerBanner.position.set(0, 2.35, s * 43.52);
    if (s === 1) innerBanner.rotation.y = Math.PI;
    root.add(innerBanner);

    const spawnLight = new THREE.PointLight(s === 1 ? 0xdbeeff : 0xffe5c4, 7.5, 20, 1.5);
    spawnLight.position.set(0, 3.8, s * 39.0);
    root.add(spawnLight);

    // Sniper High Platform ("右侧狙击高台", Y = 2.65m)
    const platCx = s * 13.4;
    const platCz = s * 27.4;
    for (const px of [s * 10.6, s * 16.1]) {
      for (const pz of [s * 24.4, s * 30.4]) {
        addBox(px, 0, pz, 0.36, 2.5, 0.36, assets.hullDarkMat, { material: 'steel', noStepUp: true });
      }
    }
    addBox(platCx, 2.45, platCz, 6.4, 0.2, 6.8, assets.sniperGrateMat, {
      material: 'steel',
      noStepUp: true,
      minimapColor: '#56697a',
    });

    addWoodCrate(s * 11.8, 2.65, s * 24.3, 2.6, 1.05, 0.55, false);
    addBox(s * 14.9, 2.65, s * 24.15, 3.1, 0.96, 0.18, assets.hazardMat, { material: 'steel', noStepUp: true });
    addBox(s * 10.3, 2.65, s * 26.2, 0.18, 0.96, 3.6, assets.hazardMat, { material: 'steel', noStepUp: true });

    const rMinZ = Math.min(s * 30.8, s * 37.6);
    const rMaxZ = Math.max(s * 30.8, s * 37.6);
    collision.addRamp({
      id: `sniper_ramp_${s}`,
      minX: Math.min(s * 13.1, s * 16.5),
      maxX: Math.max(s * 13.1, s * 16.5),
      minZ: rMinZ,
      maxZ: rMaxZ,
      axis: 'z',
      yAtMin: s === 1 ? 2.65 : 0.0,
      yAtMax: s === 1 ? 0.0 : 2.65,
      thickness: 0.7,
      material: 'steel',
    });
    buildVisualRampStairs(
      root,
      s * 14.8,
      rMinZ,
      rMaxZ,
      s === 1 ? 2.65 : 0.0,
      s === 1 ? 0.0 : 2.65,
      3.2,
      assets.sniperGrateMat
    );

    // Fast stepped crouch-jump crates beside Sniper Platform
    addWoodCrate(s * 9.3, 0, s * 29.8, 1.35, 0.92, 1.35, false);
    addWoodCrate(s * 9.3, 0, s * 28.2, 1.35, 1.78, 1.35, false);

    // Spawn Courtyard Transverse Container ("家门口大横箱")
    addShippingContainer(s * -0.4, 0, s * 27.6, 5.8, 2.65, 2.45, s === 1 ? 'blue' : 'orange', false);
    addWoodCrate(s * 3.4, 0, s * 27.6, 1.5, 1.72, 1.5, false);

    // Left Courtyard Container & Stepped Jump Crates
    addShippingContainer(s * -10.8, 0, s * 27.4, 2.45, 2.65, 6.0, s === 1 ? 'green' : 'blue', true);
    addWoodCrate(s * -10.8, 0, s * 31.3, 1.4, 0.92, 1.4, false);
    addWoodCrate(s * -9.1, 0, s * 29.4, 1.35, 1.78, 1.35, false);
    addWoodCrate(s * -14.8, 0, s * 24.0, 1.65, 1.48, 1.2, false);

    // Mid-Approach Containers & Classic Wallbang Crates
    addShippingContainer(s * -3.3, 0, s * 14.2, 2.45, 2.65, 5.8, s === 1 ? 'yellow' : 'red', true);
    addWoodCrate(s * 3.1, 0, s * 13.2, 1.65, 1.72, 1.65, false);
    addWoodCrate(s * 4.5, 0, s * 14.5, 1.25, 1.05, 1.25, false);

    addShippingContainer(s * 10.3, 0, s * 13.6, 2.45, 2.65, 5.4, s === 1 ? 'orange' : 'green', true);
    addWoodCrate(s * -14.6, 0, s * 9.2, 1.65, 1.68, 1.5, false);

    // Central Double-Stacked Tower Containers
    addShippingContainer(s * 6.0, 0, s * 4.8, 2.5, 2.65, 6.2, s === 1 ? 'red' : 'blue', true);
    addShippingContainer(s * 6.0, 2.65, s * 4.8, 2.5, 2.65, 6.2, 'yellow', true, false);

    addShippingContainer(s * -6.0, 0, s * 3.8, 2.5, 2.65, 5.6, s === 1 ? 'blue' : 'green', true);
    addWoodCrate(s * -3.9, 0, s * 7.5, 1.35, 0.94, 1.35, false);
    addWoodCrate(s * -5.4, 0, s * 7.5, 1.35, 1.82, 1.35, false);
  }

  // =========================================================================
  // 5. BLENDER 5.3 HOLLOW WALKTHROUGH RED CONTAINER ("中路开口铁皮集装箱")
  // =========================================================================
  const hollowMesh = assets.createHollowContainerMesh();
  hollowMesh.position.set(0, 0, 0);
  root.add(hollowMesh);

  const hcW = 3.16;
  const hcLen = 12.4;
  addBox(0, 0, 0, hcW, 0.1, hcLen, assets.hullDarkMat, {
    visual: false,
    material: 'container',
    penetrable: false,
    minimapColor: '#a82c25',
  });
  addBox(-1.49, 0.1, 0, 0.18, 2.44, hcLen, assets.hullDarkMat, {
    visual: false,
    material: 'container',
    noStepUp: true,
  });
  addBox(1.49, 0.1, 0, 0.18, 2.44, hcLen, assets.hullDarkMat, {
    visual: false,
    material: 'container',
    noStepUp: true,
  });
  addBox(0, 2.54, 0, hcW, 0.14, hcLen, assets.hullDarkMat, {
    visual: false,
    material: 'container',
    noStepUp: true,
  });

  for (const sz of [1, -1]) {
    addBox(sz * 1.45, 0.05, sz * 6.85, 0.14, 2.52, 1.35, assets.hullDarkMat, {
      visual: false,
      material: 'container',
      noStepUp: true,
    });
    addWoodCrate(sz * -0.65, 0, sz * 7.4, 1.28, 1.24, 1.28, false);
  }

  const midContainerLight = new THREE.PointLight(0xffcf8b, 4.5, 13, 1.5);
  midContainerLight.position.set(0, 2.25, 0);
  root.add(midContainerLight);

  // =========================================================================
  // 6. BLENDER 5.3 CARGO FREIGHTER SUPERSTRUCTURE, TRUSS CRANES, BOW & OCEAN
  // =========================================================================
  const { updateEnvironment } = buildShipExteriorAndOcean(scene, root, assets);

  const spawns: Record<TeamId, SpawnPoint[]> = {
    GR: [
      { x: -6.6, y: 0.05, z: 38.8, yaw: 0 },
      { x: 6.6, y: 0.05, z: 38.8, yaw: 0 },
      { x: -4.8, y: 0.05, z: 40.2, yaw: 0 },
      { x: 4.8, y: 0.05, z: 40.2, yaw: 0 },
      { x: 0.0, y: 0.05, z: 39.8, yaw: 0 },
      { x: -8.6, y: 0.05, z: 41.2, yaw: 0 },
      { x: 8.6, y: 0.05, z: 41.2, yaw: 0 },
      { x: 2.0, y: 0.05, z: 41.6, yaw: 0 },
    ],
    BL: [
      { x: 6.6, y: 0.05, z: -38.8, yaw: Math.PI },
      { x: -6.6, y: 0.05, z: -38.8, yaw: Math.PI },
      { x: 4.8, y: 0.05, z: -40.2, yaw: Math.PI },
      { x: -4.8, y: 0.05, z: -40.2, yaw: Math.PI },
      { x: 0.0, y: 0.05, z: -39.8, yaw: Math.PI },
      { x: 8.6, y: 0.05, z: -41.2, yaw: Math.PI },
      { x: -8.6, y: 0.05, z: -41.2, yaw: Math.PI },
      { x: -2.0, y: 0.05, z: -41.6, yaw: Math.PI },
    ],
  };

  return {
    spawns,
    wayNodes: buildNavigationGraph(),
    updateEnvironment,
    minimapContainers,
  };
}

function buildVisualRampStairs(
  root: THREE.Group,
  cx: number,
  minZ: number,
  maxZ: number,
  yAtMin: number,
  yAtMax: number,
  width: number,
  mat: THREE.Material
): void {
  const steps = 14;
  const dz = (maxZ - minZ) / steps;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const z = minZ + (i + 0.5) * dz;
    const y = THREE.MathUtils.lerp(yAtMin, yAtMax, t);
    const tread = new THREE.Mesh(new THREE.BoxGeometry(width, 0.24, Math.abs(dz) * 1.04), mat);
    tread.position.set(cx, y - 0.12, z);
    tread.receiveShadow = true;
    root.add(tread);
  }
}

function makeFactionSignMesh(team: TeamId): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = team === 'GR' ? '#163554' : '#4a2812';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = team === 'GR' ? '#58b4ff' : '#f5a638';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 500, 116);

  ctx.fillStyle = team === 'GR' ? '#86ccff' : '#ffd07a';
  ctx.font = '900 40px Impact, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(team === 'GR' ? 'GLOBAL RISK · 保卫者' : 'BLACK LIST · 潜伏者', 256, 64);
  ctx.font = 'bold 20px Consolas, sans-serif';
  ctx.fillStyle = '#dce6f0';
  ctx.fillText('SECTOR TD-SHIP // TACTICAL DEPLOYMENT', 256, 98);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshBasicMaterial({ map: tex }));
}

function buildShipExteriorAndOcean(
  scene: THREE.Scene,
  root: THREE.Group,
  assets: LoadedGameAssets
): { updateEnvironment: (t: number) => void } {
  const skyGeo = new THREE.SphereGeometry(420, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0.45, 0.42, -0.78).normalize() },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      uniform vec3 uSunDir;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        vec3 dir = normalize(vWorldPos);
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 horizon = vec3(0.76, 0.83, 0.90);
        vec3 zenith  = vec3(0.16, 0.36, 0.64);
        vec3 sky = mix(horizon, zenith, pow(h, 0.60));

        if (dir.y > 0.04) {
          vec2 uv = dir.xz / (dir.y + 0.18) * 1.8;
          float c = noise(uv) * 0.6 + noise(uv * 2.3) * 0.4;
          float cloudMask = smoothstep(0.52, 0.82, c) * smoothstep(0.04, 0.25, dir.y);
          sky = mix(sky, vec3(0.95, 0.97, 1.0), cloudMask * 0.48);
        }

        float sunAmt = max(dot(dir, uSunDir), 0.0);
        sky += vec3(1.0, 0.80, 0.50) * pow(sunAmt, 24.0) * 0.42;
        sky += vec3(1.0, 0.96, 0.86) * smoothstep(0.9991, 0.99985, sunAmt) * 2.2;
        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // Animated GLSL Ocean Water Shader
  const oceanGeo = new THREE.PlaneGeometry(680, 680, 120, 120);
  oceanGeo.rotateX(-Math.PI / 2);
  const oceanUniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.45, 0.42, -0.78).normalize() },
  };
  const oceanMat = new THREE.ShaderMaterial({
    uniforms: oceanUniforms,
    vertexShader: `
      uniform float uTime;
      varying vec3 vPos;
      varying float vWave;
      void main() {
        vec3 p = position;
        float w1 = sin(p.x * 0.14 + uTime * 1.45) * cos(p.z * 0.09 + uTime * 1.1) * 0.48;
        float w2 = sin((p.x * 0.27 - p.z * 0.21) + uTime * 2.2) * 0.22;
        p.y += w1 + w2;
        vPos = p;
        vWave = w1 + w2;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSunDir;
      varying vec3 vPos;
      varying float vWave;
      void main() {
        vec3 deep = vec3(0.04, 0.16, 0.26);
        vec3 shallow = vec3(0.09, 0.31, 0.44);
        float crest = smoothstep(-0.45, 0.55, vWave);
        vec3 col = mix(deep, shallow, crest);

        float hullDistX = abs(abs(vPos.x) - 18.4);
        float alongHull = smoothstep(86.0, 62.0, abs(vPos.z));
        float foamNoise = sin(vPos.z * 0.7 + uTime * 4.5) * 0.5 + 0.5;
        float wake = smoothstep(4.2, 0.3, hullDistX) * alongHull * (0.45 + 0.55 * foamNoise);
        col = mix(col, vec3(0.88, 0.94, 0.98), clamp(wake, 0.0, 0.85));

        vec3 viewDir = normalize(cameraPosition - vPos);
        vec3 n = normalize(vec3(-cos(vPos.x * 0.21 + uTime * 1.6) * 0.16, 1.0, -sin(vPos.z * 0.18 + uTime * 1.3) * 0.16));
        vec3 refl = reflect(-uSunDir, n);
        float spec = pow(max(dot(viewDir, refl), 0.0), 48.0);
        col += vec3(1.0, 0.88, 0.68) * spec * 0.85;

        float dist = length(vPos.xz);
        float fog = smoothstep(130.0, 330.0, dist);
        col = mix(col, vec3(0.72, 0.79, 0.86), fog);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.position.y = -5.6;
  scene.add(oceanMesh);

  // Outer Freighter Hull
  const hullGroup = new THREE.Group();
  root.add(hullGroup);

  const hullMain = new THREE.Mesh(new THREE.BoxGeometry(36.4, 6.2, 114), assets.hullRedMat);
  hullMain.position.set(0, -3.5, 4);
  hullGroup.add(hullMain);

  const hullBootTop = new THREE.Mesh(new THREE.BoxGeometry(36.8, 1.6, 115), assets.hullDarkMat);
  hullBootTop.position.set(0, -0.5, 4);
  hullGroup.add(hullBootTop);

  // Blender 5.3 Sculpted Forecastle Bow (North Forward Z = -44)
  const bow = assets.createShipProp('ForecastleBow');
  bow.position.set(0, -0.4, -44.0);
  hullGroup.add(bow);

  // Blender 5.3 Sculpted 6-Story Bridge Superstructure + Lifeboats + Funnel (South Aft Z = +52.5)
  const bridge = assets.createShipProp('BridgeSuperstructure');
  bridge.position.set(0, 0, 52.5);
  hullGroup.add(bridge);

  // Rotating 3D Marine Radar Bar atop Bridge Mast
  const radarBar = new THREE.Mesh(
    new THREE.BoxGeometry(5.0, 0.36, 0.55),
    new THREE.MeshStandardMaterial({ color: 0xe6a825, metalness: 0.5, roughness: 0.4 })
  );
  radarBar.position.set(0, 22.9, 50.1);
  hullGroup.add(radarBar);

  // Two Blender 5.3 Latticed H-Beam Maritime Gantry Cranes ("货轮龙门吊塔")
  for (const [cz, flip] of [[-19.5, true], [19.5, false]] as const) {
    const crane = assets.createShipProp('GantryCrane');
    crane.position.set(0, 0, cz);
    if (flip) crane.rotation.y = Math.PI;
    hullGroup.add(crane);
  }

  // Blender 5.3 Beveled Lifebuoy Rings with Reflective Bands mounted along Bulwarks
  for (const rz of [-30, -12, 0, 12, 30]) {
    for (const sx of [-1, 1]) {
      const buoy = assets.createShipProp('Lifebuoy');
      buoy.rotation.z = Math.PI / 2;
      buoy.position.set(sx * 16.7, 2.15, rz);
      hullGroup.add(buoy);
    }
  }

  // Distant Mountain / Harbor Island Silhouettes on Horizon
  const islandMat = new THREE.MeshBasicMaterial({ color: 0x5c7288 });
  for (const [ix, iz, r, h] of [
    [-190, -160, 58, 28],
    [210, -120, 72, 34],
    [-220, 150, 65, 22],
  ]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), islandMat);
    cone.position.set(ix, h / 2 - 6, iz);
    scene.add(cone);
  }

  return {
    updateEnvironment: (t: number) => {
      oceanUniforms.uTime.value = t;
      radarBar.rotation.y = t * 2.2;
    },
  };
}

function buildNavigationGraph(): WayNode[] {
  return [
    { id: 'gr_spawn_l', x: -6.5, y: 0, z: 38.0, neighbors: ['gr_exit_l', 'gr_spawn_r'], tag: 'spawn_gr' },
    { id: 'gr_spawn_r', x: 6.5, y: 0, z: 38.0, neighbors: ['gr_exit_r', 'gr_spawn_l', 'gr_sniper_bot'], tag: 'spawn_gr' },
    { id: 'gr_exit_l', x: -6.6, y: 0, z: 31.5, neighbors: ['gr_spawn_l', 'gr_yard_l', 'gr_yard_mid'], tag: 'spawn_gr' },
    { id: 'gr_exit_r', x: 6.6, y: 0, z: 31.5, neighbors: ['gr_spawn_r', 'gr_yard_r', 'gr_yard_mid', 'gr_sniper_bot'], tag: 'spawn_gr' },

    { id: 'gr_sniper_bot', x: 14.8, y: 0, z: 37.2, neighbors: ['gr_exit_r', 'gr_sniper_top'], tag: 'sniper_gr' },
    { id: 'gr_sniper_top', x: 13.4, y: 2.65, z: 26.8, neighbors: ['gr_sniper_bot'], tag: 'sniper_gr' },

    { id: 'gr_yard_l', x: -13.8, y: 0, z: 25.5, neighbors: ['gr_exit_l', 'west_lane_s', 'tun_w_s'], tag: 'left' },
    { id: 'gr_yard_mid', x: 0.0, y: 0, z: 23.0, neighbors: ['gr_exit_l', 'gr_exit_r', 'mid_s_l', 'mid_s_r'], tag: 'mid' },
    { id: 'gr_yard_r', x: 8.2, y: 0, z: 23.5, neighbors: ['gr_exit_r', 'east_lane_s', 'tun_e_s', 'mid_s_r'], tag: 'right' },

    { id: 'west_lane_s', x: -10.2, y: 0, z: 12.0, neighbors: ['gr_yard_l', 'west_lane_n', 'mid_s_l'], tag: 'left' },
    { id: 'west_lane_n', x: -10.2, y: 0, z: -12.0, neighbors: ['west_lane_s', 'bl_yard_r', 'mid_n_l'], tag: 'left' },

    { id: 'east_lane_s', x: 13.8, y: 0, z: 10.0, neighbors: ['gr_yard_r', 'east_lane_n'], tag: 'right' },
    { id: 'east_lane_n', x: 13.8, y: 0, z: -10.0, neighbors: ['east_lane_s', 'bl_yard_l'], tag: 'right' },

    { id: 'mid_s_l', x: -3.0, y: 0, z: 8.8, neighbors: ['gr_yard_mid', 'west_lane_s', 'mid_open_s', 'mid_flank_w'], tag: 'mid' },
    { id: 'mid_s_r', x: 3.0, y: 0, z: 8.8, neighbors: ['gr_yard_mid', 'gr_yard_r', 'mid_open_s', 'mid_flank_e'], tag: 'mid' },

    { id: 'mid_open_s', x: 0.0, y: 0.1, z: 5.5, neighbors: ['mid_s_l', 'mid_s_r', 'mid_open_n'], tag: 'container' },
    { id: 'mid_open_n', x: 0.0, y: 0.1, z: -5.5, neighbors: ['mid_open_s', 'mid_n_l', 'mid_n_r'], tag: 'container' },
    { id: 'mid_flank_w', x: -3.1, y: 0, z: 0.0, neighbors: ['mid_s_l', 'mid_n_l'], tag: 'mid' },
    { id: 'mid_flank_e', x: 3.1, y: 0, z: 0.0, neighbors: ['mid_s_r', 'mid_n_r'], tag: 'mid' },

    { id: 'mid_n_l', x: -3.0, y: 0, z: -8.8, neighbors: ['mid_flank_w', 'mid_open_n', 'west_lane_n', 'bl_yard_mid'], tag: 'mid' },
    { id: 'mid_n_r', x: 3.0, y: 0, z: -8.8, neighbors: ['mid_flank_e', 'mid_open_n', 'bl_yard_l', 'bl_yard_mid'], tag: 'mid' },

    { id: 'tun_e_s', x: 14.8, y: 0, z: 23.0, neighbors: ['gr_yard_r', 'tun_e_mid'], tag: 'tunnel' },
    { id: 'tun_e_mid', x: 14.8, y: -3.2, z: 0.0, neighbors: ['tun_e_s', 'tun_e_n'], tag: 'tunnel' },
    { id: 'tun_e_n', x: 14.8, y: 0, z: -23.0, neighbors: ['tun_e_mid', 'bl_yard_l'], tag: 'tunnel' },

    { id: 'tun_w_s', x: -14.8, y: 0, z: 23.0, neighbors: ['gr_yard_l', 'tun_w_mid'], tag: 'tunnel' },
    { id: 'tun_w_mid', x: -14.8, y: -3.2, z: 0.0, neighbors: ['tun_w_s', 'tun_w_n'], tag: 'tunnel' },
    { id: 'tun_w_n', x: -14.8, y: 0, z: -23.0, neighbors: ['tun_w_mid', 'bl_yard_r'], tag: 'tunnel' },

    { id: 'bl_yard_l', x: 13.8, y: 0, z: -25.5, neighbors: ['east_lane_n', 'tun_e_n', 'bl_exit_l', 'mid_n_r'], tag: 'left' },
    { id: 'bl_yard_mid', x: 0.0, y: 0, z: -23.0, neighbors: ['mid_n_l', 'mid_n_r', 'bl_exit_l', 'bl_exit_r'], tag: 'mid' },
    { id: 'bl_yard_r', x: -8.2, y: 0, z: -23.5, neighbors: ['west_lane_n', 'tun_w_n', 'bl_exit_r'], tag: 'right' },

    { id: 'bl_sniper_bot', x: -14.8, y: 0, z: -37.2, neighbors: ['bl_exit_r', 'bl_sniper_top'], tag: 'sniper_bl' },
    { id: 'bl_sniper_top', x: -13.4, y: 2.65, z: -26.8, neighbors: ['bl_sniper_bot'], tag: 'sniper_bl' },

    { id: 'bl_exit_l', x: 6.6, y: 0, z: -31.5, neighbors: ['bl_yard_l', 'bl_yard_mid', 'bl_spawn_l'], tag: 'spawn_bl' },
    { id: 'bl_exit_r', x: -6.6, y: 0, z: -31.5, neighbors: ['bl_yard_r', 'bl_yard_mid', 'bl_spawn_r', 'bl_sniper_bot'], tag: 'spawn_bl' },
    { id: 'bl_spawn_l', x: 6.5, y: 0, z: -38.0, neighbors: ['bl_exit_l', 'bl_spawn_r'], tag: 'spawn_bl' },
    { id: 'bl_spawn_r', x: -6.5, y: 0, z: -38.0, neighbors: ['bl_exit_r', 'bl_spawn_l', 'bl_sniper_bot'], tag: 'spawn_bl' },
  ];
}
