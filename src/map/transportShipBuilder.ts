import * as THREE from 'three';
import { CollisionWorld } from '../physics/collisionWorld';
import { TextureBundle } from '../textures/proceduralTextures';
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
  tex: TextureBundle
): BuiltShipWorld {
  collision.clear();
  const root = new THREE.Group();
  root.name = 'TransportShipRoot';
  scene.add(root);

  const minimapContainers: Array<{ x: number; z: number; w: number; d: number; color: string }> = [];

  // Helper: add axis-aligned box mesh + optional physics collider
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
      material?: MaterialType;
      penetrable?: boolean;
      castShadow?: boolean;
      receiveShadow?: boolean;
      noStepUp?: boolean;
      minimapColor?: string;
    } = {}
  ): THREE.Mesh => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, minY + h / 2, cz);
    mesh.castShadow = opts.castShadow ?? true;
    mesh.receiveShadow = opts.receiveShadow ?? true;
    root.add(mesh);

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

  // Helper: add standard 20ft/40ft shipping container (with proper face materials)
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
    const side = tex.containerSideMats[color];
    const door = tex.containerDoorMats[color];
    const roof = tex.containerRoofMats[color];
    // BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z
    const mats = alongZ
      ? [side, side, roof, roof, door, door]
      : [door, door, roof, roof, side, side];

    const mapHex: Record<typeof color, string> = {
      red: '#b63b34',
      blue: '#2d6da8',
      green: '#387d4e',
      yellow: '#cfa030',
      orange: '#c66530',
    };

    addBox(cx, minY, cz, w, h, d, mats, {
      material: 'container',
      penetrable: false,
      noStepUp: true,
      minimapColor: showOnMinimap ? mapHex[color] : undefined,
    });
  };

  // Helper: add classic CF penetrable wooden crate ("可穿透木箱")
  const addWoodCrate = (cx: number, minY: number, cz: number, w: number, h: number, d: number, stepable = false): void => {
    addBox(cx, minY, cz, w, h, d, tex.woodCrateMat, {
      material: 'wood',
      penetrable: true,
      noStepUp: !stepable && h > 0.55,
      minimapColor: '#b98b50',
    });
  };

  // =========================================================================
  // 1. MAIN STEEL DECK SLABS (with exact cutouts for the 4 Underground Tunnel Ramps)
  // Stairwell openings at X = ±[13.2, 16.4], Z = ±[15.5, 22.5]
  // =========================================================================
  const deckThickness = 0.36;
  // Central continuous spine X = [-13.2, +13.2], Z = [-44, +44]
  addBox(0, -deckThickness, 0, 26.4, deckThickness, 88.0, tex.deckMaterial, {
    material: 'steel',
    castShadow: false,
  });

  // West & East outer deck strips around stairwell cutouts
  for (const sx of [-1, 1]) {
    const stripCx = sx * 14.8; // covers [13.2, 16.4]
    // South aft strip Z = [22.5, 44.0] -> len 21.5, center 33.25
    addBox(stripCx, -deckThickness, 33.25, 3.2, deckThickness, 21.5, tex.deckMaterial, {
      material: 'steel',
      castShadow: false,
    });
    // North aft strip Z = [-44.0, -22.5] -> len 21.5, center -33.25
    addBox(stripCx, -deckThickness, -33.25, 3.2, deckThickness, 21.5, tex.deckMaterial, {
      material: 'steel',
      castShadow: false,
    });
    // Mid lane bridge slab Z = [-15.5, 15.5] -> len 31.0 (walkable deck above, tunnel ceiling below!)
    addBox(stripCx, -deckThickness, 0, 3.2, deckThickness, 31.0, tex.deckMaterial, {
      material: 'steel',
      castShadow: false,
    });
    // Outer trim strip [16.4, 16.9]
    addBox(sx * 16.65, -deckThickness, 0, 0.5, deckThickness, 88.0, tex.deckMaterial, {
      material: 'steel',
      castShadow: false,
    });
  }

  // Painted yellow tactical deck lane markings (visual decals on Y = 0.006)
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd9a127, transparent: true, opacity: 0.55 });
  for (const lx of [-12.9, 12.9]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 76), lineMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(lx, 0.008, 0);
    root.add(strip);
  }
  // Center Z=0 divider line across deck
  const midLine = new THREE.Mesh(new THREE.PlaneGeometry(25.5, 0.18), lineMat);
  midLine.rotation.x = -Math.PI / 2;
  midLine.position.set(0, 0.008, 0);
  root.add(midLine);

  // =========================================================================
  // 2. DUAL FLANKING UNDERGROUND TUNNELS ("两侧地下暗道 / 下水道", Y = -3.2m)
  // =========================================================================
  for (const sx of [-1, 1]) {
    const tunCx = sx * 14.8; // X = ±[13.2, 16.4], width 3.2m

    // Underground floor from Z = -22.5 to +22.5 at Y = -3.55..-3.2
    addBox(tunCx, -3.55, 0, 3.4, 0.35, 45.2, tex.bunkerFloorMat, {
      material: 'steel',
      castShadow: false,
    });

    // Inner & Outer tunnel walls (Z = -22.6 to +22.6, Y = -3.2 to 0.0)
    addBox(sx * 13.08, -3.2, 0, 0.24, 3.2, 45.2, tex.tunnelWallMat, {
      material: 'steel',
      castShadow: false,
    });
    addBox(sx * 16.52, -3.2, 0, 0.24, 3.2, 45.2, tex.tunnelWallMat, {
      material: 'steel',
      castShadow: false,
    });

    // End walls sealing stairwell pit behind ramps at Z = ±22.6
    addBox(tunCx, -3.2, 22.6, 3.4, 3.2, 0.24, tex.tunnelWallMat, { material: 'steel', castShadow: false });
    addBox(tunCx, -3.2, -22.6, 3.4, 3.2, 0.24, tex.tunnelWallMat, { material: 'steel', castShadow: false });

    // South Ramp: Z = [15.5 -> 22.5], Y = [-3.2 -> 0.0]
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
    // Visual stepped ramp geometry for South stairwell
    buildVisualRampStairs(root, tunCx, 15.5, 22.5, -3.2, 0.0, 3.16, tex.sniperGrateMat);

    // North Ramp: Z = [-22.5 -> -15.5], Y = [0.0 -> -3.2]
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
    buildVisualRampStairs(root, tunCx, -22.5, -15.5, 0.0, -3.2, 3.16, tex.sniperGrateMat);

    // Surface safety guardrail along inner edge of stairwell openings (Z = ±[15.5, 21.8])
    for (const sz of [-1, 1]) {
      addBox(sx * 13.08, 0, sz * 18.65, 0.22, 1.04, 6.3, tex.hazardMat, {
        material: 'steel',
        noStepUp: true,
      });
    }

    // Subterranean tactical cover crates inside tunnel (for tense close-quarters peeking)
    addWoodCrate(tunCx - sx * 0.65, -3.2, 6.2 * sx, 1.15, 1.28, 1.15);
    addWoodCrate(tunCx + sx * 0.65, -3.2, -6.2 * sx, 1.15, 1.28, 1.15);

    // Warm waterproof amber bulkhead lights inside Underground Tunnel
    for (const lz of [-11, 0, 11]) {
      const bulb = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.14, 0.55),
        new THREE.MeshBasicMaterial({ color: 0xffb347 })
      );
      bulb.position.set(tunCx, -0.44, lz);
      root.add(bulb);

      if (lz === 0) {
        const ptLight = new THREE.PointLight(0xff9f38, 5.5, 16, 1.6);
        ptLight.position.set(tunCx, -0.75, 0);
        root.add(ptLight);
      }
    }
  }

  // =========================================================================
  // 3. PERIMETER SHIP BULWARK WALLS (Playable Arena Boundaries)
  // =========================================================================
  const wallH = 5.4;
  addBox(-17.05, -0.35, 0, 0.5, wallH, 88.6, tex.concreteWallMat, { material: 'steel', noStepUp: true });
  addBox(17.05, -0.35, 0, 0.5, wallH, 88.6, tex.concreteWallMat, { material: 'steel', noStepUp: true });
  addBox(0, -0.35, 44.05, 34.6, wallH, 0.5, tex.concreteWallMat, { material: 'concrete', noStepUp: true });
  addBox(0, -0.35, -44.05, 34.6, wallH, 0.5, tex.concreteWallMat, { material: 'concrete', noStepUp: true });

  // =========================================================================
  // 4. 180-DEGREE POINT-SYMMETRIC SPAWN BUNKERS, SNIPER TOWERS & COURTYARDS
  // s = +1 -> South (Global Risk 保卫者)
  // s = -1 -> North (Black List 潜伏者)
  // =========================================================================
  for (const s of [1, -1] as const) {
    // --- A. Spawn Warehouse Cabin (Z = s * [34.2 .. 43.8], X = [-12.6 .. +12.6]) ---
    // Slight raised concrete bunker floor pad (+0.04m visual)
    const pad = new THREE.Mesh(new THREE.BoxGeometry(25.0, 0.04, 9.5), tex.bunkerFloorMat);
    pad.position.set(0, 0.02, s * 39.0);
    pad.receiveShadow = true;
    root.add(pad);

    // Side bunker walls
    addBox(-12.6, 0, s * 39.0, 0.45, 4.3, 9.6, tex.concreteWallMat, { material: 'concrete', noStepUp: true });
    addBox(12.6, 0, s * 39.0, 0.45, 4.3, 9.6, tex.concreteWallMat, { material: 'concrete', noStepUp: true });

    // Front bunker wall with TWO large tactical doorways at X = [-9.6..-3.6] and [+3.6..+9.6]
    // Left outer jamb [-12.6..-9.6]
    addBox(-11.1, 0, s * 34.2, 3.0, 4.3, 0.5, tex.concreteWallMat, { material: 'concrete', noStepUp: true });
    // Center shield wall [-3.6..+3.6]
    addBox(0, 0, s * 34.2, 7.2, 4.3, 0.5, tex.concreteWallMat, { material: 'concrete', noStepUp: true });
    // Right outer jamb [+9.6..+12.6]
    addBox(11.1, 0, s * 34.2, 3.0, 4.3, 0.5, tex.concreteWallMat, { material: 'concrete', noStepUp: true });
    // Lintel beam above both doorways (Y = 3.25..4.3)
    addBox(-6.6, 3.25, s * 34.2, 6.0, 1.05, 0.5, tex.concreteWallMat, { material: 'concrete', noStepUp: true });
    addBox(6.6, 3.25, s * 34.2, 6.0, 1.05, 0.5, tex.concreteWallMat, { material: 'concrete', noStepUp: true });

    // Spawn Bunker Roof Slab (Y = 4.3..4.7)
    addBox(0, 4.3, s * 39.0, 25.6, 0.4, 10.1, tex.concreteWallMat, { material: 'concrete', noStepUp: true });

    // Faction Banner Sign inside & outside center bunker wall
    const signBanner = makeFactionSignMesh(s === 1 ? 'GR' : 'BL');
    signBanner.position.set(0, 2.35, s * 33.92);
    if (s === 1) signBanner.rotation.y = Math.PI;
    root.add(signBanner);

    const innerBanner = makeFactionSignMesh(s === 1 ? 'GR' : 'BL');
    innerBanner.position.set(0, 2.35, s * 43.52);
    if (s === 1) innerBanner.rotation.y = Math.PI;
    root.add(innerBanner);

    // Warm indoor bunker light
    const spawnLight = new THREE.PointLight(s === 1 ? 0xdbeeff : 0xffe5c4, 6.5, 18, 1.5);
    spawnLight.position.set(0, 3.8, s * 39.0);
    root.add(spawnLight);

    // --- B. Iconic Sniper High Platform ("右侧狙击高台", Y = 2.65m) ---
    // Located on each team's RIGHT flank when facing enemy:
    // For GR (s=1, facing -Z): X = [+10.2 .. +16.6], Z = [+24.0 .. +30.8]
    // For BL (s=-1, facing +Z): X = [-16.6 .. -10.2], Z = [-30.8 .. -24.0]
    const platCx = s * 13.4;
    const platCz = s * 27.4;
    // Support steel pillars under platform
    for (const px of [s * 10.6, s * 16.1]) {
      for (const pz of [s * 24.4, s * 30.4]) {
        addBox(px, 0, pz, 0.36, 2.5, 0.36, tex.hullDarkMat, { material: 'steel', noStepUp: true });
      }
    }
    // Sniper platform walkable deck slab (Y = 2.45..2.65)
    addBox(platCx, 2.45, platCz, 6.4, 0.2, 6.8, tex.sniperGrateMat, {
      material: 'steel',
      noStepUp: true,
      minimapColor: '#56697a',
    });

    // Sniper platform front tactical cover (half penetrable wood box + half low rail at Z = s * 24.15)
    // Standing eye on platform = 2.65 + 1.70 = 4.35; parapet top = 3.68 -> exposes upper chest/head, hides full crouch!
    addWoodCrate(s * 11.8, 2.65, s * 24.3, 2.6, 1.05, 0.5, false);
    addBox(s * 14.9, 2.65, s * 24.15, 3.1, 0.96, 0.18, tex.hazardMat, { material: 'steel', noStepUp: true });
    // Side guardrail facing mid so snipers have crisp framing
    addBox(s * 10.3, 2.65, s * 26.2, 0.18, 0.96, 3.6, tex.hazardMat, { material: 'steel', noStepUp: true });

    // Smooth Access Ramp up to Sniper Platform along outer alley X = s * [13.2..16.4], Z = s * [30.8 .. 37.6]
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
      tex.sniperGrateMat
    );

    // Stepped crouch-jump wooden crates beside Sniper Platform (fast shortcut for skilled players!)
    addWoodCrate(s * 9.3, 0, s * 29.8, 1.35, 0.92, 1.35, false);
    addWoodCrate(s * 9.3, 0, s * 28.2, 1.35, 1.78, 1.35, false);

    // --- C. Spawn Courtyard Transverse Container ("家门口大横箱") ---
    addShippingContainer(
      s * -0.4,
      0,
      s * 27.6,
      5.8,
      2.65,
      2.45,
      s === 1 ? 'blue' : 'orange',
      false
    );
    // Classic CF penetrable tall peek crate right beside the transverse container
    addWoodCrate(s * 3.4, 0, s * 27.6, 1.5, 1.72, 1.5, false);

    // --- D. Left Courtyard Container & Stepped Jump Crates ("左路蓝/绿集装箱 + 木箱阶梯") ---
    addShippingContainer(
      s * -10.8,
      0,
      s * 27.4,
      2.45,
      2.65,
      6.0,
      s === 1 ? 'green' : 'blue',
      true
    );
    // Stepped wooden crates to climb onto Left Container roof (Y = 2.65)
    addWoodCrate(s * -10.8, 0, s * 31.3, 1.4, 0.92, 1.4, false);
    addWoodCrate(s * -9.1, 0, s * 29.4, 1.35, 1.78, 1.35, false);

    // Cover crate guarding the Underground Tunnel exit on Left Flank (X = s * -14.8, Z = s * 23.8)
    addWoodCrate(s * -14.8, 0, s * 24.0, 1.65, 1.48, 1.2, false);

    // --- E. Mid-Approach Containers & Classic Wallbang Crates (Z = s * [9 .. 19]) ---
    // Left-Mid angled/offset container framing the main rifle lane
    addShippingContainer(
      s * -3.3,
      0,
      s * 14.2,
      2.45,
      2.65,
      5.8,
      s === 1 ? 'yellow' : 'red',
      true
    );
    // Classic CF Headshot-Line Tall Wooden Crate on Right-Mid lane ("中路右道穿箱点")
    addWoodCrate(s * 3.1, 0, s * 13.2, 1.65, 1.72, 1.65, false);
    addWoodCrate(s * 4.5, 0, s * 14.5, 1.25, 1.05, 1.25, false);

    // Outer Side-Lane Cover Container (Z = s * 13.8, X = s * -10.4)
    addShippingContainer(
      s * 10.3,
      0,
      s * 13.6,
      2.45,
      2.65,
      5.4,
      s === 1 ? 'orange' : 'green',
      true
    );
    // Side-lane wooden peek crate on opposite outer corridor (X = s * -14.8, Z = s * 8.6)
    addWoodCrate(s * -14.6, 0, s * 9.2, 1.65, 1.68, 1.5, false);

    // --- F. Central Double-Stacked Tower Containers (Y = 0..5.3m, flanking Center Hollow Container) ---
    addShippingContainer(
      s * 6.0,
      0,
      s * 4.8,
      2.5,
      2.65,
      6.2,
      s === 1 ? 'red' : 'blue',
      true
    );
    addShippingContainer(
      s * 6.0,
      2.65,
      s * 4.8,
      2.5,
      2.65,
      6.2,
      'yellow',
      true,
      false
    );

    // Opposite mid-side single container + climbable crates to reach Mid rooftops!
    addShippingContainer(
      s * -6.0,
      0,
      s * 3.8,
      2.5,
      2.65,
      5.6,
      s === 1 ? 'blue' : 'green',
      true
    );
    // Jump crates to climb onto Mid Containers (classic CF "上中箱身法点")
    addWoodCrate(s * -3.9, 0, s * 7.5, 1.35, 0.94, 1.35, false);
    addWoodCrate(s * -5.4, 0, s * 7.5, 1.35, 1.82, 1.35, false);
  }

  // =========================================================================
  // 5. ICONIC CENTER HOLLOW WALKTHROUGH CONTAINER ("中路开口铁皮集装箱", X=[-1.58..+1.58], Z=[-6.2..+6.2])
  // Players can run INSIDE (Y=0.10..2.52) OR jump ON TOP (Y=2.68)!
  // =========================================================================
  const hcW = 3.16;
  const hcLen = 12.4;
  // Container wooden interior floor
  addBox(0, 0, 0, hcW, 0.1, hcLen, tex.woodCrateMat, {
    material: 'container',
    penetrable: false,
    minimapColor: '#a82c25',
  });
  // West & East corrugated steel walls
  addBox(-1.49, 0.1, 0, 0.18, 2.44, hcLen, tex.containerSideMats.red, {
    material: 'container',
    penetrable: false,
    noStepUp: true,
  });
  addBox(1.49, 0.1, 0, 0.18, 2.44, hcLen, tex.containerSideMats.red, {
    material: 'container',
    penetrable: false,
    noStepUp: true,
  });
  // Container roof slab (walkable at Y = 2.68!)
  addBox(0, 2.54, 0, hcW, 0.14, hcLen, tex.containerRoofMats.red, {
    material: 'container',
    penetrable: false,
    noStepUp: true,
  });

  // Swung-open container steel doors at both ends (angled tactical cover + authentic visual!)
  for (const sz of [1, -1]) {
    addBox(sz * 1.45, 0.05, sz * 6.85, 0.14, 2.52, 1.35, tex.containerDoorMats.red, {
      material: 'container',
      penetrable: false,
      noStepUp: true,
    });
    // Classic waist-high penetrable wooden crate just outside each open mouth of the center container
    addWoodCrate(sz * -0.65, 0, sz * 7.4, 1.28, 1.24, 1.28, false);
  }

  // Interior warm bounce light inside the hollow central container
  const midContainerLight = new THREE.PointLight(0xffcf8b, 3.8, 12, 1.6);
  midContainerLight.position.set(0, 2.25, 0);
  root.add(midContainerLight);

  // =========================================================================
  // 6. FULL CARGO FREIGHTER EXTERIOR: HULL, BRIDGE TOWER, BOW, CRANES & OCEAN SHADER
  // =========================================================================
  const { updateEnvironment } = buildShipExteriorAndOcean(scene, root, tex);

  // =========================================================================
  // 7. SPAWN POINTS & TACTICAL BOT NAVIGATION GRAPH (All 5 Routes!)
  // =========================================================================
  const spawns: Record<TeamId, SpawnPoint[]> = {
    GR: [
      { x: -7.2, y: 0.05, z: 38.5, yaw: 0 },
      { x: -4.2, y: 0.05, z: 40.2, yaw: 0 },
      { x: 0.0, y: 0.05, z: 39.5, yaw: 0 },
      { x: 4.2, y: 0.05, z: 40.2, yaw: 0 },
      { x: 7.2, y: 0.05, z: 38.5, yaw: 0 },
      { x: -9.5, y: 0.05, z: 41.4, yaw: 0 },
      { x: 9.5, y: 0.05, z: 41.4, yaw: 0 },
      { x: 1.8, y: 0.05, z: 41.8, yaw: 0 },
    ],
    BL: [
      { x: 7.2, y: 0.05, z: -38.5, yaw: Math.PI },
      { x: 4.2, y: 0.05, z: -40.2, yaw: Math.PI },
      { x: 0.0, y: 0.05, z: -39.5, yaw: Math.PI },
      { x: -4.2, y: 0.05, z: -40.2, yaw: Math.PI },
      { x: -7.2, y: 0.05, z: -38.5, yaw: Math.PI },
      { x: 9.5, y: 0.05, z: -41.4, yaw: Math.PI },
      { x: -9.5, y: 0.05, z: -41.4, yaw: Math.PI },
      { x: -1.8, y: 0.05, z: -41.8, yaw: Math.PI },
    ],
  };

  const wayNodes: WayNode[] = buildNavigationGraph();

  return {
    spawns,
    wayNodes,
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
  return new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 1.15),
    new THREE.MeshBasicMaterial({ map: tex })
  );
}

function buildShipExteriorAndOcean(
  scene: THREE.Scene,
  root: THREE.Group,
  tex: TextureBundle
): { updateEnvironment: (t: number) => void } {
  // 1. Atmospheric Maritime Sky Dome Shader
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

        // Wispy maritime high-altitude clouds
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

  // 2. Animated GLSL Ocean Water Shader with Ship Wake Foam
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

        // White ship hull wake foam along freighter sides (X ~ ±18.5, Z in [-82, +74])
        float hullDistX = abs(abs(vPos.x) - 18.4);
        float alongHull = smoothstep(86.0, 62.0, abs(vPos.z));
        float foamNoise = sin(vPos.z * 0.7 + uTime * 4.5) * 0.5 + 0.5;
        float wake = smoothstep(4.2, 0.3, hullDistX) * alongHull * (0.45 + 0.55 * foamNoise);
        col = mix(col, vec3(0.88, 0.94, 0.98), clamp(wake, 0.0, 0.85));

        // Sun glitter highlights
        vec3 viewDir = normalize(cameraPosition - vPos);
        vec3 n = normalize(vec3(-cos(vPos.x * 0.21 + uTime * 1.6) * 0.16, 1.0, -sin(vPos.z * 0.18 + uTime * 1.3) * 0.16));
        vec3 refl = reflect(-uSunDir, n);
        float spec = pow(max(dot(viewDir, refl), 0.0), 48.0);
        col += vec3(1.0, 0.88, 0.68) * spec * 0.85;

        // Distance horizon haze
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

  // 3. Outer Freighter Hull (Port, Starboard, Stern & Raked Bow)
  const hullGroup = new THREE.Group();
  root.add(hullGroup);

  const hullMain = new THREE.Mesh(new THREE.BoxGeometry(36.4, 6.2, 118), tex.hullRedMat);
  hullMain.position.set(0, -3.5, 0);
  hullGroup.add(hullMain);

  const hullBootTop = new THREE.Mesh(new THREE.BoxGeometry(36.8, 1.6, 119), tex.hullDarkMat);
  hullBootTop.position.set(0, -0.5, 0);
  hullGroup.add(hullBootTop);

  // Raked Ship Bow Prow (North Z = -44 to -78)
  const bowDeck = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 18.2, 32, 4, 1), tex.hullRedMat);
  bowDeck.rotation.y = Math.PI / 4;
  bowDeck.rotation.x = Math.PI / 2;
  bowDeck.position.set(0, -1.8, -62);
  hullGroup.add(bowDeck);

  // Forward Forecastle Mast & Anchor Winches (visible over North BL wall!)
  const foreMast = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.55, 18, 8), tex.craneYellowMat);
  foreMast.position.set(0, 9.0, -54);
  foreMast.castShadow = true;
  hullGroup.add(foreMast);

  const mastCrossbar = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.35, 0.35), tex.craneYellowMat);
  mastCrossbar.position.set(0, 15.2, -54);
  hullGroup.add(mastCrossbar);

  // 4. Towering 6-Story White Ship Bridge Superstructure (South Aft behind GR Spawn, Z = +46..+66)
  const bridgeBase = new THREE.Mesh(new THREE.BoxGeometry(28, 13.5, 14), tex.bridgeWhiteMat);
  bridgeBase.position.set(0, 6.75, 52.5);
  bridgeBase.castShadow = true;
  bridgeBase.receiveShadow = true;
  hullGroup.add(bridgeBase);

  const bridgeUpper = new THREE.Mesh(new THREE.BoxGeometry(32.5, 4.2, 8.5), tex.bridgeWhiteMat);
  bridgeUpper.position.set(0, 15.2, 50.5);
  bridgeUpper.castShadow = true;
  hullGroup.add(bridgeUpper);

  // Tinted dark glass bridge windows
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x102334, roughness: 0.15, metalness: 0.85 });
  const bridgeGlass = new THREE.Mesh(new THREE.BoxGeometry(31.2, 1.5, 0.3), glassMat);
  bridgeGlass.position.set(0, 15.6, 46.2);
  hullGroup.add(bridgeGlass);

  // Cabin porthole window strips
  for (const wy of [6.5, 9.5, 12.2]) {
    const winRow = new THREE.Mesh(new THREE.BoxGeometry(24, 0.75, 0.25), glassMat);
    winRow.position.set(0, wy, 45.45);
    hullGroup.add(winRow);
  }

  // Classic Red & Black Ship Smokestack Funnel
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.6, 8.5, 16), tex.hullRedMat);
  funnel.position.set(0, 20.5, 56.5);
  hullGroup.add(funnel);
  const funnelCap = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.15, 1.8, 16), tex.hullDarkMat);
  funnelCap.position.set(0, 24.5, 56.5);
  hullGroup.add(funnelCap);

  // Rotating 3D Marine Radar Scanner atop the Bridge
  const radarMast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 5.5, 8), tex.bridgeWhiteMat);
  radarMast.position.set(0, 19.8, 49.5);
  hullGroup.add(radarMast);

  const radarBar = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.38, 0.55), tex.craneYellowMat);
  radarBar.position.set(0, 22.7, 49.5);
  hullGroup.add(radarBar);

  // 5. Two Giant Maritime Deck Gantry Cranes ("货轮龙门吊塔")
  for (const cz of [-19.5, 19.5]) {
    const legL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 16.5, 1.1), tex.craneYellowMat);
    legL.position.set(-17.3, 8.2, cz);
    legL.castShadow = true;
    hullGroup.add(legL);

    const legR = new THREE.Mesh(new THREE.BoxGeometry(1.1, 16.5, 1.1), tex.craneYellowMat);
    legR.position.set(17.3, 8.2, cz);
    legR.castShadow = true;
    hullGroup.add(legR);

    const beam = new THREE.Mesh(new THREE.BoxGeometry(36.8, 1.35, 1.45), tex.craneYellowMat);
    beam.position.set(0, 16.4, cz);
    beam.castShadow = true;
    hullGroup.add(beam);

    // Trolley & hanging spreader cables
    const trolley = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 2.2), tex.hullDarkMat);
    trolley.position.set(cz > 0 ? 5.5 : -5.5, 15.4, cz);
    hullGroup.add(trolley);
  }

  // Orange Life Rings mounted along inner ship bulwarks
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xe8531e, roughness: 0.45 });
  const ringGeo = new THREE.TorusGeometry(0.46, 0.13, 10, 20);
  for (const rz of [-30, -12, 0, 12, 30]) {
    for (const sx of [-1, 1]) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(sx * 16.72, 2.1, rz);
      hullGroup.add(ring);
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
      radarBar.rotation.y = t * 2.1;
    },
  };
}

function buildNavigationGraph(): WayNode[] {
  const nodes: WayNode[] = [
    // South GR Base & Exits
    { id: 'gr_spawn_l', x: -6.5, y: 0, z: 38.0, neighbors: ['gr_exit_l', 'gr_spawn_r'], tag: 'spawn_gr' },
    { id: 'gr_spawn_r', x: 6.5, y: 0, z: 38.0, neighbors: ['gr_exit_r', 'gr_spawn_l', 'gr_sniper_bot'], tag: 'spawn_gr' },
    { id: 'gr_exit_l', x: -6.6, y: 0, z: 31.5, neighbors: ['gr_spawn_l', 'gr_yard_l', 'gr_yard_mid'], tag: 'spawn_gr' },
    { id: 'gr_exit_r', x: 6.6, y: 0, z: 31.5, neighbors: ['gr_spawn_r', 'gr_yard_r', 'gr_yard_mid', 'gr_sniper_bot'], tag: 'spawn_gr' },

    // GR Sniper Tower
    { id: 'gr_sniper_bot', x: 14.8, y: 0, z: 37.2, neighbors: ['gr_exit_r', 'gr_sniper_top'], tag: 'sniper_gr' },
    { id: 'gr_sniper_top', x: 13.4, y: 2.65, z: 26.8, neighbors: ['gr_sniper_bot'], tag: 'sniper_gr' },

    // GR Courtyards
    { id: 'gr_yard_l', x: -13.8, y: 0, z: 25.5, neighbors: ['gr_exit_l', 'west_lane_s', 'tun_w_s'], tag: 'left' },
    { id: 'gr_yard_mid', x: 0.0, y: 0, z: 23.0, neighbors: ['gr_exit_l', 'gr_exit_r', 'mid_s_l', 'mid_s_r'], tag: 'mid' },
    { id: 'gr_yard_r', x: 8.2, y: 0, z: 23.5, neighbors: ['gr_exit_r', 'east_lane_s', 'tun_e_s', 'mid_s_r'], tag: 'right' },

    // Surface Lanes & Center Container
    { id: 'west_lane_s', x: -10.2, y: 0, z: 12.0, neighbors: ['gr_yard_l', 'west_lane_n', 'mid_s_l'], tag: 'left' },
    { id: 'west_lane_n', x: -10.2, y: 0, z: -12.0, neighbors: ['west_lane_s', 'bl_yard_r', 'mid_n_l'], tag: 'left' },

    { id: 'east_lane_s', x: 13.8, y: 0, z: 10.0, neighbors: ['gr_yard_r', 'east_lane_n'], tag: 'right' },
    { id: 'east_lane_n', x: 13.8, y: 0, z: -10.0, neighbors: ['east_lane_s', 'bl_yard_l'], tag: 'right' },

    { id: 'mid_s_l', x: -3.0, y: 0, z: 8.8, neighbors: ['gr_yard_mid', 'west_lane_s', 'mid_open_s', 'mid_flank_w'], tag: 'mid' },
    { id: 'mid_s_r', x: 3.0, y: 0, z: 8.8, neighbors: ['gr_yard_mid', 'gr_yard_r', 'mid_open_s', 'mid_flank_e'], tag: 'mid' },

    // Inside Hollow Central Container & Mid Side Gaps
    { id: 'mid_open_s', x: 0.0, y: 0.1, z: 5.5, neighbors: ['mid_s_l', 'mid_s_r', 'mid_open_n'], tag: 'container' },
    { id: 'mid_open_n', x: 0.0, y: 0.1, z: -5.5, neighbors: ['mid_open_s', 'mid_n_l', 'mid_n_r'], tag: 'container' },
    { id: 'mid_flank_w', x: -3.1, y: 0, z: 0.0, neighbors: ['mid_s_l', 'mid_n_l'], tag: 'mid' },
    { id: 'mid_flank_e', x: 3.1, y: 0, z: 0.0, neighbors: ['mid_s_r', 'mid_n_r'], tag: 'mid' },

    { id: 'mid_n_l', x: -3.0, y: 0, z: -8.8, neighbors: ['mid_flank_w', 'mid_open_n', 'west_lane_n', 'bl_yard_mid'], tag: 'mid' },
    { id: 'mid_n_r', x: 3.0, y: 0, z: -8.8, neighbors: ['mid_flank_e', 'mid_open_n', 'bl_yard_l', 'bl_yard_mid'], tag: 'mid' },

    // Dual Underground Tunnels (West & East)
    { id: 'tun_e_s', x: 14.8, y: 0, z: 23.0, neighbors: ['gr_yard_r', 'tun_e_mid'], tag: 'tunnel' },
    { id: 'tun_e_mid', x: 14.8, y: -3.2, z: 0.0, neighbors: ['tun_e_s', 'tun_e_n'], tag: 'tunnel' },
    { id: 'tun_e_n', x: 14.8, y: 0, z: -23.0, neighbors: ['tun_e_mid', 'bl_yard_l'], tag: 'tunnel' },

    { id: 'tun_w_s', x: -14.8, y: 0, z: 23.0, neighbors: ['gr_yard_l', 'tun_w_mid'], tag: 'tunnel' },
    { id: 'tun_w_mid', x: -14.8, y: -3.2, z: 0.0, neighbors: ['tun_w_s', 'tun_w_n'], tag: 'tunnel' },
    { id: 'tun_w_n', x: -14.8, y: 0, z: -23.0, neighbors: ['tun_w_mid', 'bl_yard_r'], tag: 'tunnel' },

    // North BL Courtyards, Sniper Tower & Base
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

  return nodes;
}
