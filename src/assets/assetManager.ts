import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { WeaponId } from '../types';

export type ContainerColorKey = 'red' | 'blue' | 'green' | 'yellow' | 'orange';

export interface LoadedGameAssets {
  deckMat: THREE.MeshStandardMaterial;
  bunkerWallMat: THREE.MeshStandardMaterial;
  bunkerFloorMat: THREE.MeshStandardMaterial;
  tunnelWallMat: THREE.MeshStandardMaterial;
  hazardMat: THREE.MeshStandardMaterial;
  sniperGrateMat: THREE.MeshStandardMaterial;
  hullRedMat: THREE.MeshStandardMaterial;
  hullDarkMat: THREE.MeshStandardMaterial;

  createWoodCrateMesh: (w: number, h: number, d: number) => THREE.Object3D;
  createISOContainerMesh: (w: number, h: number, d: number, color: ContainerColorKey, alongZ: boolean) => THREE.Object3D;
  createHollowContainerMesh: () => THREE.Object3D;
  createShipProp: (name: 'GantryCrane' | 'BridgeSuperstructure' | 'ForecastleBow' | 'Lifebuoy' | 'TunnelPipeSegment') => THREE.Object3D;
  createWeaponMesh: (id: WeaponId) => THREE.Group;
}

export async function loadAllGameAssets(
  maxAnisotropy: number,
  onProgress?: (pct: number, label: string) => void
): Promise<LoadedGameAssets> {
  const aniso = Math.min(8, maxAnisotropy || 4);
  const texLoader = new THREE.TextureLoader();
  const gltfLoader = new GLTFLoader();

  let doneCount = 0;
  const totalItems = 14;
  const tick = (label: string) => {
    doneCount++;
    onProgress?.(Math.min(100, Math.round((doneCount / totalItems) * 100)), label);
  };

  const loadTex = (url: string, repeatX = 1, repeatY = 1, forGLTF = false): Promise<THREE.Texture> =>
    new Promise((resolve, reject) => {
      texLoader.load(
        url,
        (t) => {
          t.wrapS = THREE.RepeatWrapping;
          t.wrapT = THREE.RepeatWrapping;
          t.repeat.set(repeatX, repeatY);
          t.flipY = !forGLTF;
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = aniso;
          t.needsUpdate = true;
          tick(url);
          resolve(t);
        },
        undefined,
        reject
      );
    });

  const makeBumpClone = (src: THREE.Texture): THREE.Texture => {
    // Share the same Texture object directly so we never mutate shared Source.colorSpace!
    return src;
  };

  const loadGLB = (url: string): Promise<THREE.Group> =>
    new Promise((resolve, reject) => {
      gltfLoader.load(
        url,
        (gltf) => {
          tick(url);
          resolve(gltf.scene);
        },
        undefined,
        reject
      );
    });

  const [
    deckTex,
    sniperTex,
    bunkerTex,
    tunnelTex,
    crateTexGLTF,
    contRedTexGLTF,
    contMetalTexGLTF,
    contDoorTexGLTF,
    gunWalnutTexGLTF,
    gunCamoTexGLTF,
    woodCrateGLB,
    isoContainerGLB,
    hollowContainerGLB,
    shipStructuresGLB,
    weaponsArsenalGLB,
  ] = await Promise.all([
    loadTex('./textures/deck_steel.jpg', 14, 44, false),
    loadTex('./textures/deck_steel.jpg', 3, 3, false),
    loadTex('./textures/bunker_concrete.jpg', 4, 1, false),
    loadTex('./textures/tunnel_bulkhead.jpg', 7, 1, false),
    loadTex('./textures/wood_crate.jpg', 1, 1, true),
    loadTex('./textures/container_red.jpg', 1, 1, true),
    loadTex('./textures/container_metal.jpg', 1, 1, true),
    loadTex('./textures/container_door.jpg', 1, 1, true),
    loadTex('./textures/gun_walnut.jpg', 2, 2, true),
    loadTex('./textures/gun_camo.jpg', 2, 2, true),
    loadGLB('./models/wood_crate.glb'),
    loadGLB('./models/container_iso.glb'),
    loadGLB('./models/container_hollow.glb'),
    loadGLB('./models/ship_structures.glb'),
    loadGLB('./models/weapons_arsenal.glb'),
  ]);

  // 1. World Surface PBR Materials with AI Albedo + Luminance Bump Maps
  const deckMat = new THREE.MeshStandardMaterial({
    map: deckTex,
    bumpMap: deckTex,
    bumpScale: 0.085,
    roughness: 0.66,
    metalness: 0.28,
  });

  const bunkerWallMat = new THREE.MeshStandardMaterial({
    map: bunkerTex,
    bumpMap: bunkerTex,
    bumpScale: 0.05,
    roughness: 0.78,
    metalness: 0.22,
  });

  const bunkerFloorMat = new THREE.MeshStandardMaterial({
    map: sniperTex,
    bumpMap: sniperTex,
    bumpScale: 0.06,
    color: 0xaab6c2,
    roughness: 0.68,
    metalness: 0.3,
  });

  const tunnelWallMat = new THREE.MeshStandardMaterial({
    map: tunnelTex,
    bumpMap: makeBumpClone(tunnelTex),
    bumpScale: 0.055,
    roughness: 0.58,
    metalness: 0.55,
  });

  // Procedural crisp yellow/black hazard curb & sniper grating materials
  const hazardCanvas = document.createElement('canvas');
  hazardCanvas.width = 256;
  hazardCanvas.height = 64;
  const hctx = hazardCanvas.getContext('2d')!;
  hctx.fillStyle = '#e6ab1e';
  hctx.fillRect(0, 0, 256, 64);
  hctx.fillStyle = '#181b20';
  for (let x = -64; x < 320; x += 48) {
    hctx.beginPath();
    hctx.moveTo(x, 0); hctx.lineTo(x + 24, 0);
    hctx.lineTo(x + 88, 64); hctx.lineTo(x + 64, 64);
    hctx.closePath(); hctx.fill();
  }
  const hazardTex = new THREE.CanvasTexture(hazardCanvas);
  hazardTex.wrapS = THREE.RepeatWrapping;
  hazardTex.wrapT = THREE.RepeatWrapping;
  hazardTex.repeat.set(4, 1);
  hazardTex.colorSpace = THREE.SRGBColorSpace;
  const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.5, metalness: 0.3 });

  const sniperGrateMat = new THREE.MeshStandardMaterial({
    map: sniperTex,
    bumpMap: sniperTex,
    bumpScale: 0.07,
    color: 0xb6c4d2,
    roughness: 0.5,
    metalness: 0.55,
  });

  // 2. Bind AI Textures onto Blender WoodCrate Template
  const cratePlankMat = new THREE.MeshStandardMaterial({
    map: crateTexGLTF,
    bumpMap: makeBumpClone(crateTexGLTF),
    bumpScale: 0.048,
    roughness: 0.82,
    metalness: 0.05,
  });
  const crateFrameMat = new THREE.MeshStandardMaterial({
    map: crateTexGLTF,
    bumpMap: makeBumpClone(crateTexGLTF),
    bumpScale: 0.035,
    color: 0xd4be9e,
    roughness: 0.78,
    metalness: 0.06,
  });
  const crateIronMat = new THREE.MeshStandardMaterial({
    color: 0x262a30,
    roughness: 0.38,
    metalness: 0.85,
  });

  woodCrateGLB.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh;
      m.castShadow = true;
      m.receiveShadow = true;
      const matName = (m.material as THREE.Material)?.name || '';
      if (matName.includes('IRON')) m.material = crateIronMat;
      else if (matName.includes('FRAME')) m.material = crateFrameMat;
      else m.material = cratePlankMat;
    }
  });

  // 3. Prepare Color-Tinted AI Container Materials for Blender ISOContainer & HollowContainer
  const colorConfigs: Record<ContainerColorKey, { panelTint: number; frameTint: number; useNativeRed?: boolean }> = {
    red:    { panelTint: 0xffffff, frameTint: 0x701e19, useNativeRed: true },
    blue:   { panelTint: 0x2f6fb0, frameTint: 0x193f68 },
    green:  { panelTint: 0x3b8052, frameTint: 0x1f4a2e },
    yellow: { panelTint: 0xdfa62e, frameTint: 0x8c6312 },
    orange: { panelTint: 0xd86930, frameTint: 0x823914 },
  };

  const containerMatSets = {} as Record<
    ContainerColorKey,
    { panel: THREE.Material; door: THREE.Material; frame: THREE.Material; chrome: THREE.Material; seal: THREE.Material }
  >;

  const sharedChrome = new THREE.MeshStandardMaterial({ color: 0xd8e0e8, metalness: 0.94, roughness: 0.2 });
  const sharedSeal = new THREE.MeshStandardMaterial({ color: 0x14171a, metalness: 0.1, roughness: 0.88 });

  (Object.keys(colorConfigs) as ContainerColorKey[]).forEach((ck) => {
    const cfg = colorConfigs[ck];
    const pTex = cfg.useNativeRed ? contRedTexGLTF : contMetalTexGLTF;
    containerMatSets[ck] = {
      panel: new THREE.MeshStandardMaterial({
        map: pTex,
        bumpMap: makeBumpClone(pTex),
        bumpScale: 0.045,
        color: cfg.panelTint,
        roughness: 0.52,
        metalness: 0.36,
      }),
      door: new THREE.MeshStandardMaterial({
        map: contDoorTexGLTF,
        bumpMap: makeBumpClone(contDoorTexGLTF),
        bumpScale: 0.035,
        color: cfg.useNativeRed ? 0xb5332b : cfg.panelTint,
        roughness: 0.5,
        metalness: 0.38,
      }),
      frame: new THREE.MeshStandardMaterial({
        map: contMetalTexGLTF,
        color: cfg.frameTint,
        roughness: 0.48,
        metalness: 0.46,
      }),
      chrome: sharedChrome,
      seal: sharedSeal,
    };
  });

  // Apply red AI container textures to Blender HollowContainer
  hollowContainerGLB.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh;
      m.castShadow = true;
      m.receiveShadow = true;
      const matName = (m.material as THREE.Material)?.name || '';
      if (matName.includes('FLOOR')) {
        m.material = crateFrameMat;
      } else if (matName.includes('LOCK')) {
        m.material = sharedChrome;
      } else if (matName.includes('FRAME')) {
        m.material = containerMatSets.red.frame;
      } else {
        m.material = containerMatSets.red.panel;
      }
    }
  });

  // Enable shadows on Ship Structures
  shipStructuresGLB.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  // 4. Bind AI Walnut & Camo Textures onto Blender High-Detail Weapons!
  const walnutMat = new THREE.MeshStandardMaterial({
    map: gunWalnutTexGLTF,
    bumpMap: makeBumpClone(gunWalnutTexGLTF),
    bumpScale: 0.02,
    roughness: 0.42,
    metalness: 0.14,
  });
  const camoMat = new THREE.MeshStandardMaterial({
    map: gunCamoTexGLTF,
    bumpMap: makeBumpClone(gunCamoTexGLTF),
    bumpScale: 0.018,
    roughness: 0.42,
    metalness: 0.48,
  });

  weaponsArsenalGLB.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh;
      const matName = (m.material as THREE.Material)?.name || '';
      if (matName.includes('WALNUT')) m.material = walnutMat;
      else if (matName.includes('CAMO')) m.material = camoMat;
    }
  });

  const weaponNodeMap: Record<WeaponId, string> = {
    ak47: 'Weapon_AK47',
    m4a1s: 'Weapon_M4A1S',
    awm: 'Weapon_AWM',
    barrett: 'Weapon_Barrett',
    deagle: 'Weapon_Deagle',
    kukri: 'Weapon_Kukri',
    he_grenade: 'Weapon_Grenade',
  };

  return {
    deckMat,
    bunkerWallMat,
    bunkerFloorMat,
    tunnelWallMat,
    hazardMat,
    sniperGrateMat,
    hullRedMat: new THREE.MeshStandardMaterial({
      map: contRedTexGLTF,
      color: 0x8f2922,
      roughness: 0.62,
      metalness: 0.36,
    }),
    hullDarkMat: new THREE.MeshStandardMaterial({
      color: 0x202730,
      roughness: 0.56,
      metalness: 0.52,
    }),

    createWoodCrateMesh: (w, h, d) => {
      const inst = woodCrateGLB.clone(true);
      inst.scale.set(w, h, d);
      return inst;
    },

    createISOContainerMesh: (w, h, d, color, alongZ) => {
      const inst = isoContainerGLB.clone(true);
      const set = containerMatSets[color];
      inst.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.castShadow = true;
          m.receiveShadow = true;
          const mn = (m.material as THREE.Material)?.name || '';
          if (mn.includes('DOOR') && !mn.includes('SEAL')) m.material = set.door;
          else if (mn.includes('SEAL')) m.material = set.seal;
          else if (mn.includes('LOCK')) m.material = set.chrome;
          else if (mn.includes('FRAME')) m.material = set.frame;
          else m.material = set.panel;
        }
      });
      if (alongZ) {
        inst.scale.set(w, h, d);
      } else {
        inst.rotation.y = Math.PI / 2;
        inst.scale.set(d, h, w);
      }
      return inst;
    },

    createHollowContainerMesh: () => {
      return hollowContainerGLB.clone(true);
    },

    createShipProp: (name) => {
      const found = shipStructuresGLB.getObjectByName(name);
      if (!found) {
        return new THREE.Group();
      }
      const clone = found.clone(true);
      clone.position.set(0, 0, 0);
      clone.rotation.set(0, 0, 0);
      clone.scale.set(1, 1, 1);
      return clone;
    },

    createWeaponMesh: (id) => {
      const grp = new THREE.Group();
      const found = weaponsArsenalGLB.getObjectByName(weaponNodeMap[id]);
      if (found) {
        const clone = found.clone(true);
        clone.position.set(0, 0, 0);
        clone.rotation.set(0, 0, 0);
        clone.scale.set(1, 1, 1);
        grp.add(clone);
      }
      return grp;
    },
  };
}
