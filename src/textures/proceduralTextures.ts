import * as THREE from 'three';

export interface TextureBundle {
  deckMaterial: THREE.MeshStandardMaterial;
  concreteWallMat: THREE.MeshStandardMaterial;
  bunkerFloorMat: THREE.MeshStandardMaterial;
  tunnelWallMat: THREE.MeshStandardMaterial;
  hazardMat: THREE.MeshStandardMaterial;
  woodCrateMat: THREE.MeshStandardMaterial;
  sniperGrateMat: THREE.MeshStandardMaterial;
  hullRedMat: THREE.MeshStandardMaterial;
  hullDarkMat: THREE.MeshStandardMaterial;
  bridgeWhiteMat: THREE.MeshStandardMaterial;
  craneYellowMat: THREE.MeshStandardMaterial;
  containerSideMats: Record<'red' | 'blue' | 'green' | 'yellow' | 'orange', THREE.MeshStandardMaterial>;
  containerDoorMats: Record<'red' | 'blue' | 'green' | 'yellow' | 'orange', THREE.MeshStandardMaterial>;
  containerRoofMats: Record<'red' | 'blue' | 'green' | 'yellow' | 'orange', THREE.MeshStandardMaterial>;
}

function makeCanvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1,
  srgb = true
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  if (srgb) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

export function buildProceduralTextures(maxAnisotropy: number): TextureBundle {
  const aniso = Math.min(8, maxAnisotropy || 4);

  // 1. Ship Anti-Slip Steel Deck Texture
  const deckMap = makeCanvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#56616c';
    ctx.fillRect(0, 0, w, h);

    // Subtle steel plate grid & weld seams
    ctx.strokeStyle = '#38414a';
    ctx.lineWidth = 3;
    for (let x = 0; x <= w; x += 128) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y <= h; y += 128) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Weathering speckles & maritime wear
    for (let i = 0; i < 3800; i++) {
      const v = 68 + Math.floor(Math.random() * 44);
      ctx.fillStyle = `rgba(${v},${v + 6},${v + 12},0.26)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }

    // Anti-slip diamond tread pattern + container twistlock sockets
    ctx.fillStyle = 'rgba(255,255,255,0.11)';
    for (let y = 8; y < h; y += 16) {
      for (let x = 8; x < w; x += 16) {
        ctx.fillRect(x, y, 5, 2);
        ctx.fillRect(x + 6, y + 6, 2, 5);
      }
    }

    // Rivets along plate corners
    ctx.fillStyle = '#2d353d';
    for (let y = 8; y < h; y += 128) {
      for (let x = 8; x < w; x += 32) {
        ctx.fillRect(x, y, 3, 3);
      }
    }
  }, aniso, 10, 26);

  const deckBump = makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#404040';
    ctx.lineWidth = 2;
    for (let i = 0; i <= w; i += 64) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
    }
    ctx.fillStyle = '#b5b5b5';
    for (let y = 4; y < h; y += 12) {
      for (let x = 4; x < w; x += 12) {
        ctx.fillRect(x, y, 3, 2);
      }
    }
  }, aniso, 10, 26, false);

  const deckMaterial = new THREE.MeshStandardMaterial({
    map: deckMap,
    bumpMap: deckBump,
    bumpScale: 0.035,
    roughness: 0.68,
    metalness: 0.36,
  });

  // 2. Classic CF Penetrable Wooden Crate Texture (Beveled planks + diagonal cross brace + stencil)
  const woodMap = makeCanvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#b98952';
    ctx.fillRect(0, 0, w, h);

    // Horizontal planks inside frame
    const plankCount = 6;
    const plankH = h / plankCount;
    for (let p = 0; p < plankCount; p++) {
      const y0 = p * plankH;
      const shade = (p % 2 === 0 ? 6 : -6) + (Math.random() * 8 - 4);
      ctx.fillStyle = `rgb(${184 + shade}, ${135 + shade}, ${78 + shade * 0.6})`;
      ctx.fillRect(0, y0, w, plankH - 2);

      // Wood grain streaks
      for (let g = 0; g < 26; g++) {
        ctx.fillStyle = `rgba(92, 56, 22, ${0.06 + Math.random() * 0.08})`;
        ctx.fillRect(0, y0 + Math.random() * plankH, w, 1.5 + Math.random() * 2);
      }

      // Plank seam
      ctx.fillStyle = '#5d3b1a';
      ctx.fillRect(0, y0 + plankH - 3, w, 3);
    }

    // Diagonal cross-brace slat (classic CF crate look!)
    ctx.save();
    ctx.strokeStyle = '#6b441e';
    ctx.lineWidth = 46;
    ctx.beginPath();
    ctx.moveTo(36, 36);
    ctx.lineTo(w - 36, h - 36);
    ctx.stroke();

    ctx.strokeStyle = '#c8985e';
    ctx.lineWidth = 40;
    ctx.beginPath();
    ctx.moveTo(36, 36);
    ctx.lineTo(w - 36, h - 36);
    ctx.stroke();
    ctx.restore();

    // Thick outer wooden frame border
    const border = 38;
    ctx.strokeStyle = '#5c3a18';
    ctx.lineWidth = border + 4;
    ctx.strokeRect(border / 2, border / 2, w - border, h - border);
    ctx.strokeStyle = '#caa068';
    ctx.lineWidth = border - 4;
    ctx.strokeRect(border / 2, border / 2, w - border, h - border);

    // Iron corner brackets & nails
    ctx.fillStyle = '#332922';
    const nails = [
      [18, 18], [w - 26, 18], [18, h - 26], [w - 26, h - 26],
      [18, h / 2], [w - 26, h / 2], [w / 2, 18], [w / 2, h - 26],
    ];
    for (const [nx, ny] of nails) {
      ctx.beginPath();
      ctx.arc(nx + 4, ny + 4, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Military Cargo Stencil
    ctx.fillStyle = 'rgba(42, 26, 12, 0.62)';
    ctx.font = 'bold 26px Impact, sans-serif';
    ctx.fillText('CF-CARGO 7.62', 64, h - 68);
    ctx.font = 'bold 18px Consolas, monospace';
    ctx.fillText('FRAGILE ↑ UP', w - 188, 84);
  }, aniso);

  const woodBump = makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#787878';
    ctx.fillRect(0, 0, w, h);
    for (let p = 1; p < 6; p++) {
      ctx.fillStyle = '#282828';
      ctx.fillRect(0, (p * h) / 6 - 2, w, 3);
    }
    ctx.strokeStyle = '#cecece';
    ctx.lineWidth = 20;
    ctx.beginPath(); ctx.moveTo(18, 18); ctx.lineTo(w - 18, h - 18); ctx.stroke();
    ctx.strokeRect(10, 10, w - 20, h - 20);
  }, aniso, 1, 1, false);

  const woodCrateMat = new THREE.MeshStandardMaterial({
    map: woodMap,
    bumpMap: woodBump,
    bumpScale: 0.055,
    roughness: 0.84,
    metalness: 0.04,
  });

  // 3. Corrugated Shipping Container Textures (Side, End Doors, Roof)
  const palette: Record<'red' | 'blue' | 'green' | 'yellow' | 'orange', { base: string; dark: string; light: string; code: string }> = {
    red:    { base: '#9e2b25', dark: '#661814', light: '#bd3d36', code: 'CFHU 208419 2' },
    blue:   { base: '#1f4f7e', dark: '#123150', light: '#2f6aa3', code: 'GRLU 551904 7' },
    green:  { base: '#2b5e3b', dark: '#193b23', light: '#3b7a4f', code: 'TRSU 883120 5' },
    yellow: { base: '#bf8b1e', dark: '#805b0e', light: '#dba432', code: 'BLLU 409271 0' },
    orange: { base: '#b55422', dark: '#753311', light: '#cf6a34', code: 'MSCU 774012 9' },
  };

  const containerBump = makeCanvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);
    // Deep vertical trapezoidal corrugations
    const ribs = 28;
    const rw = w / ribs;
    for (let i = 0; i < ribs; i++) {
      const x = i * rw;
      ctx.fillStyle = '#d8d8d8';
      ctx.fillRect(x, 18, rw * 0.44, h - 36);
      ctx.fillStyle = '#383838';
      ctx.fillRect(x + rw * 0.5, 18, rw * 0.44, h - 36);
    }
    // Top & bottom ISO steel frame rails
    ctx.fillStyle = '#efefef';
    ctx.fillRect(0, 0, w, 18);
    ctx.fillRect(0, h - 18, w, 18);
  }, aniso, 1, 1, false);

  const containerSideMats = {} as TextureBundle['containerSideMats'];
  const containerDoorMats = {} as TextureBundle['containerDoorMats'];
  const containerRoofMats = {} as TextureBundle['containerRoofMats'];

  (Object.keys(palette) as Array<keyof typeof palette>).forEach((key) => {
    const p = palette[key];

    const sideTex = makeCanvasTexture(1024, 512, (ctx, w, h) => {
      ctx.fillStyle = p.base;
      ctx.fillRect(0, 0, w, h);

      // Corrugation shading
      const ribs = 36;
      const rw = w / ribs;
      for (let i = 0; i < ribs; i++) {
        const x = i * rw;
        ctx.fillStyle = p.light;
        ctx.fillRect(x + 2, 28, rw * 0.36, h - 56);
        ctx.fillStyle = p.dark;
        ctx.fillRect(x + rw * 0.52, 28, rw * 0.36, h - 56);
      }

      // Top & bottom structural ISO beams + corner castings
      ctx.fillStyle = p.dark;
      ctx.fillRect(0, 0, w, 28);
      ctx.fillRect(0, h - 28, w, 28);
      ctx.fillRect(0, 0, 28, h);
      ctx.fillRect(w - 28, 0, 28, h);

      // Iconic CF Headshot Reference Seam Line (~63% height from bottom = 1.68m on 2.65m container!)
      const hsY = Math.round(h * (1 - 1.68 / 2.65));
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fillRect(28, hsY - 2, w - 56, 3);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(28, hsY + 1, w - 56, 3);

      // Bottom edge rust & salt-spray grime
      const grad = ctx.createLinearGradient(0, h - 90, 0, h);
      grad.addColorStop(0, 'rgba(58, 32, 18, 0)');
      grad.addColorStop(1, 'rgba(42, 24, 14, 0.52)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, h - 90, w, 90);

      // Authentic ISO shipping markings & white cargo logo
      ctx.fillStyle = 'rgba(245, 248, 250, 0.86)';
      ctx.font = 'bold 34px Consolas, Arial, sans-serif';
      ctx.fillText(p.code, w - 330, 92);
      ctx.font = 'bold 20px Consolas, Arial, sans-serif';
      ctx.fillText('45G1  MAX.GROSS 32,500 KG', w - 330, 122);

      // Bold industrial stripe & brand stencil on left
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.fillRect(74, 72, 12, 86);
      ctx.font = '900 44px Impact, Arial Black, sans-serif';
      ctx.fillText('TRANS-OCEAN', 100, 118);
      ctx.font = 'bold 20px Segoe UI, sans-serif';
      ctx.fillText('HEAVY MARINE LOGISTICS', 102, 148);

      // Yellow/black hazard diamond
      ctx.save();
      ctx.translate(115, hsY);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#f0b624';
      ctx.fillRect(-16, -16, 32, 32);
      ctx.strokeStyle = '#181818';
      ctx.lineWidth = 3;
      ctx.strokeRect(-13, -13, 26, 26);
      ctx.restore();
    }, aniso);

    const doorTex = makeCanvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = p.base;
      ctx.fillRect(0, 0, w, h);

      // Outer steel frame + center black rubber door gasket
      ctx.strokeStyle = p.dark;
      ctx.lineWidth = 28;
      ctx.strokeRect(14, 14, w - 28, h - 28);
      ctx.fillStyle = '#1b1e22';
      ctx.fillRect(w / 2 - 5, 24, 10, h - 48);

      // Horizontal door panel ribs
      ctx.fillStyle = p.dark;
      for (let y = 76; y < h - 60; y += 72) {
        ctx.fillRect(28, y, w - 56, 8);
      }

      // 4 Vertical galvanized steel locking bars + latches
      const bars = [w * 0.24, w * 0.39, w * 0.61, w * 0.76];
      for (const bx of bars) {
        ctx.fillStyle = '#b6c0c9';
        ctx.fillRect(bx - 5, 24, 10, h - 48);
        ctx.fillStyle = '#5c6670';
        ctx.fillRect(bx + 3, 24, 3, h - 48);
        // Latch handles at headshot reference height
        ctx.fillStyle = '#cfd7df';
        ctx.fillRect(bx - 14, h * 0.56, 28, 12);
      }

      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.font = 'bold 22px Consolas, monospace';
      ctx.fillText(p.code, w / 2 + 22, 86);
      ctx.font = '15px Consolas, monospace';
      ctx.fillText('TARE 3,780 KG', w / 2 + 22, 112);
      ctx.fillText('NET 28,720 KG', w / 2 + 22, 132);
    }, aniso);

    const roofTex = makeCanvasTexture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = p.dark;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 24; i++) {
        ctx.fillStyle = i % 2 === 0 ? p.base : p.dark;
        ctx.fillRect((i * w) / 24, 12, w / 48, h - 24);
      }
      // Sun-bleached weathering on container top
      ctx.fillStyle = 'rgba(220,225,230,0.08)';
      ctx.fillRect(20, 20, w - 40, h - 40);
    }, aniso);

    containerSideMats[key] = new THREE.MeshStandardMaterial({
      map: sideTex,
      bumpMap: containerBump,
      bumpScale: 0.065,
      roughness: 0.56,
      metalness: 0.34,
    });
    containerDoorMats[key] = new THREE.MeshStandardMaterial({
      map: doorTex,
      roughness: 0.52,
      metalness: 0.4,
    });
    containerRoofMats[key] = new THREE.MeshStandardMaterial({
      map: roofTex,
      bumpMap: containerBump,
      bumpScale: 0.04,
      roughness: 0.65,
      metalness: 0.3,
    });
  });

  // 4. Concrete / Steel Spawn Bunker & Ship Bulwark Walls
  const concreteTex = makeCanvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#6c757d';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3500; i++) {
      const v = 90 + Math.floor(Math.random() * 40);
      ctx.fillStyle = `rgba(${v},${v + 4},${v + 8},0.25)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 4, 4);
    }
    // Horizontal concrete / steel formwork seams + lower wainscot stripe
    ctx.strokeStyle = '#4e565e';
    ctx.lineWidth = 3;
    for (let y = 0; y < h; y += 128) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.fillStyle = '#39424a';
    ctx.fillRect(0, h - 96, w, 96);
    ctx.fillStyle = '#d99e26';
    ctx.fillRect(0, h - 102, w, 6);
  }, aniso, 4, 1);

  const concreteWallMat = new THREE.MeshStandardMaterial({
    map: concreteTex,
    roughness: 0.82,
    metalness: 0.14,
  });

  const bunkerFloorMat = new THREE.MeshStandardMaterial({
    color: 0x454d55,
    roughness: 0.78,
    metalness: 0.22,
  });

  // 5. Underground Tunnel Riveted Steel Bulkhead Wall
  const tunnelTex = makeCanvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#2d3640';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1c2228';
    ctx.lineWidth = 4;
    for (let x = 0; x <= w; x += 128) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    // Red steam pipe band & yellow caution stripe
    ctx.fillStyle = '#8b2922';
    ctx.fillRect(0, 44, w, 16);
    ctx.fillStyle = '#d19922';
    ctx.fillRect(0, h - 24, w, 8);
  }, aniso, 6, 1);

  const tunnelWallMat = new THREE.MeshStandardMaterial({
    map: tunnelTex,
    roughness: 0.62,
    metalness: 0.48,
  });

  // 6. Yellow/Black Hazard Curb
  const hazardTex = makeCanvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#e5aa1e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1b1e22';
    for (let x = -64; x < w + 64; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 24, 0);
      ctx.lineTo(x + 24 + h, h);
      ctx.lineTo(x + h, h);
      ctx.closePath();
      ctx.fill();
    }
  }, aniso, 4, 1);

  const hazardMat = new THREE.MeshStandardMaterial({
    map: hazardTex,
    roughness: 0.55,
    metalness: 0.25,
  });

  // 7. Sniper Tower Metal Grating Platform
  const grateTex = makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#323b44';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#53606e';
    ctx.lineWidth = 2;
    for (let i = 0; i <= w; i += 16) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
    }
    ctx.strokeStyle = '#d99e26';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, w - 8, h - 8);
  }, aniso, 3, 4);

  const sniperGrateMat = new THREE.MeshStandardMaterial({
    map: grateTex,
    roughness: 0.58,
    metalness: 0.52,
  });

  return {
    deckMaterial,
    concreteWallMat,
    bunkerFloorMat,
    tunnelWallMat,
    hazardMat,
    woodCrateMat,
    sniperGrateMat,
    hullRedMat: new THREE.MeshStandardMaterial({ color: 0x7d231d, roughness: 0.68, metalness: 0.32 }),
    hullDarkMat: new THREE.MeshStandardMaterial({ color: 0x222a33, roughness: 0.62, metalness: 0.42 }),
    bridgeWhiteMat: new THREE.MeshStandardMaterial({ color: 0xdce3ea, roughness: 0.52, metalness: 0.18 }),
    craneYellowMat: new THREE.MeshStandardMaterial({ color: 0xd99b21, roughness: 0.5, metalness: 0.38 }),
    containerSideMats,
    containerDoorMats,
    containerRoofMats,
  };
}
