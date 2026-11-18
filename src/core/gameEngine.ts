import * as THREE from 'three';
import { SoundEngine } from '../audio/soundEngine';
import { loadAllGameAssets, LoadedGameAssets } from '../assets/assetManager';
import { CollisionWorld, MoveState, TargetableEntity } from '../physics/collisionWorld';
import { buildTransportShip, BuiltShipWorld } from '../map/transportShipBuilder';
import { LOADOUT_BAGS, WEAPONS } from '../weapons/weaponDefs';
import { FirstPersonViewmodel } from '../weapons/viewmodel';
import { CombatEffects } from '../effects/combatEffects';
import { BotSoldier } from '../entities/botSoldier';
import { HudController, RadarBlip, ScoreboardEntry } from '../ui/hudController';
import { TouchInputManager } from '../ui/touchInput';
import { MatchConfig, TeamId, WeaponId, WeaponSlot } from '../types';

type GamePhase = 'lobby' | 'playing' | 'paused' | 'overview' | 'ended';

export class GameEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly weaponScene: THREE.Scene;
  private readonly weaponCamera: THREE.PerspectiveCamera;
  private readonly sound = new SoundEngine();
  private readonly collision = new CollisionWorld();
  private readonly hud = new HudController();
  private readonly effects: CombatEffects;
  private readonly touch: TouchInputManager;

  private assets!: LoadedGameAssets;
  private shipWorld!: BuiltShipWorld;
  private viewmodel!: FirstPersonViewmodel;
  private assetsReady = false;
  private phase: GamePhase = 'lobby';
  private returnPhaseAfterOverview: GamePhase = 'lobby';

  private config: MatchConfig = {
    playerTeam: 'GR',
    teamSize: 5,
    targetKills: 100,
    difficulty: 'normal',
    initialBag: 0,
    sensitivity: 1.0,
  };

  // Player Combat State
  private playerState: MoveState = {
    x: 0,
    y: 0.05,
    z: 39.5,
    vx: 0,
    vy: 0,
    vz: 0,
    grounded: true,
    groundMaterial: 'concrete',
    underground: false,
    zoneName: '保卫者基地舱',
  };
  private playerYaw = 0;
  private playerPitch = 0;
  private recoilOffsetPitch = 0;
  private recoilOffsetYaw = 0;
  private screenShake = 0;

  private playerHp = 100;
  private playerArmor = 100;
  private playerAlive = true;
  private playerInvuln = 3.0;
  private playerRespawnTimer = 0;
  private playerKills = 0;
  private playerDeaths = 0;
  private playerHeadshots = 0;
  private playerMultiKill = 0;
  private playerMultiKillTimer = 0;
  private firstBloodTaken = false;

  // Loadout & Weapon State
  private currentBagIndex = 0;
  private pendingBagIndex = 0;
  private bagDrawerOpen = false;
  private activeSlot: WeaponSlot = 1;
  private lastSlot: WeaponSlot = 3; // Default Q quick-switch pairs primary <-> knife!
  private ammoMag: Record<WeaponSlot, number> = { 1: 35, 2: 7, 3: 1, 4: 1 };
  private ammoRes: Record<WeaponSlot, number> = { 1: 105, 2: 35, 3: 0, 4: 0 };
  private hasGrenade = true;

  private fireCooldown = 0;
  private drawCooldown = 0;
  private reloadTimer = 0;
  private reloadTotal = 0;
  private scopeStage = 0; // 0 = unscoped, 1 = 2.6x, 2 = 6.0x
  private wasScopedBeforeBolt = false;
  private boltRezoomTimer = 0;

  // Match State
  private scoreGR = 0;
  private scoreBL = 0;
  private matchTimer = 600; // 10:00
  private bots: BotSoldier[] = [];

  // Input State
  private keys = new Set<string>();
  private mouseDownLeft = false;
  private toggleCrouch = false;
  private frameLookDX = 0;
  private frameLookDY = 0;
  private footstepAccum = 0;

  // Aerial Overview Orbit Camera
  private orbitYaw = 0.62;
  private orbitPitch = 0.56;
  private orbitDist = 66;
  private orbitDragging = false;
  private orbitLastX = 0;
  private orbitLastY = 0;

  // Timing & FPS
  private lastFrameMs = performance.now();
  private totalTime = 0;
  private fpsSmooth = 60;

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x9fb2c4, 0.0025);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 650);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // Dedicated Z-buffered AAA Viewmodel Scene & Camera (zero wall-clipping + true Z-depth!)
    this.weaponScene = new THREE.Scene();
    this.weaponCamera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.02, 10);
    this.weaponScene.add(this.weaponCamera);

    this.setupLighting();
    this.effects = new CombatEffects(this.scene);

    this.touch = new TouchInputManager({
      onAim: () => this.handleSecondaryAction(),
      onJump: () => this.tryJump(),
      onToggleCrouch: () => { this.toggleCrouch = !this.toggleCrouch; },
      onReload: () => this.startReload(),
      onQuickSwitch: () => this.quickSwitchWeapon(),
      onQuickGrenade: () => this.quickThrowGrenade(),
    });

    this.bindEvents();

    const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
    const previewBtn = document.getElementById('preview-ship-btn') as HTMLButtonElement;
    startBtn.disabled = true;
    previewBtn.disabled = true;
    startBtn.textContent = '正在加载 Blender 3D 精模与 AI 贴图 (0%)...';

    loadAllGameAssets(this.renderer.capabilities.getMaxAnisotropy(), (pct) => {
      startBtn.textContent = `正在加载 Blender 3D 精模与 AI 贴图 (${pct}%)...`;
    }).then((loaded) => {
      this.assets = loaded;
      this.shipWorld = buildTransportShip(this.scene, this.collision, loaded);
      this.viewmodel = new FirstPersonViewmodel('GR', loaded);
      this.weaponCamera.add(this.viewmodel.root);
      this.camera.add(this.viewmodel.worldMuzzleLight);
      this.assetsReady = true;
      startBtn.disabled = false;
      previewBtn.disabled = false;
      startBtn.textContent = '进入运输船战场 (START MATCH)';
    });

    this.loop(performance.now());
  }

  private setupLighting(): void {
    // Generate realistic Maritime Sky-Ocean PBR Environment Map via PMREMGenerator!
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envCanvas = document.createElement('canvas');
    envCanvas.width = 256;
    envCanvas.height = 128;
    const ectx = envCanvas.getContext('2d')!;
    const grad = ectx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0.0, '#2e68ad');
    grad.addColorStop(0.46, '#c8daea');
    grad.addColorStop(0.50, '#ffe8c2');
    grad.addColorStop(0.55, '#3b5973');
    grad.addColorStop(1.0, '#1e2b38');
    ectx.fillStyle = grad;
    ectx.fillRect(0, 0, 256, 128);
    const equirect = new THREE.CanvasTexture(envCanvas);
    equirect.mapping = THREE.EquirectangularReflectionMapping;
    equirect.colorSpace = THREE.SRGBColorSpace;
    const envRT = pmrem.fromEquirectangular(equirect);
    this.scene.environment = envRT.texture;
    this.weaponScene.environment = envRT.texture;
    equirect.dispose();
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xdff0ff, 0x455363, 0.95);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
    sun.position.set(38, 54, -42);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -32;
    sun.shadow.camera.right = 32;
    sun.shadow.camera.top = 52;
    sun.shadow.camera.bottom = -52;
    sun.shadow.camera.near = 8;
    sun.shadow.camera.far = 155;
    sun.shadow.bias = -0.00045;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x8ab8e6, 0.6);
    fill.position.set(-34, 24, 38);
    this.scene.add(fill);

    // Crisp studio tactical lighting for First-Person Viewmodel
    const wHemi = new THREE.HemisphereLight(0xe6f2ff, 0x36424f, 1.05);
    const wKey = new THREE.DirectionalLight(0xfff1d6, 2.0);
    wKey.position.set(1.5, 2.5, 1.8);
    const wRim = new THREE.DirectionalLight(0x8bc6ff, 0.9);
    wRim.position.set(-2.0, 1.2, -1.2);
    this.weaponScene.add(wHemi, wKey, wRim);
  }

  private safePointerLock(): void {
    if (this.touch.isTouchDevice) return;
    try {
      const res = this.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
      if (res && typeof res.catch === 'function') {
        res.catch(() => {});
      }
    } catch {
      // Ignore pointer lock rejection in sandboxed contexts
    }
  }

  private bindEvents(): void {
    window.addEventListener('resize', () => {
      const aspect = window.innerWidth / window.innerHeight;
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
      this.weaponCamera.aspect = aspect;
      this.weaponCamera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Lobby Option Groups
    const bindGroup = (id: string, cb: (val: string) => void) => {
      const container = document.getElementById(id)!;
      container.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
          container.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          cb((btn as HTMLElement).dataset.val!);
        });
      });
    };

    bindGroup('team-select', (v) => { this.config.playerTeam = v as TeamId; });
    bindGroup('bag-select', (v) => { this.config.initialBag = Number(v); });
    bindGroup('roster-select', (v) => { this.config.teamSize = Number(v); });
    bindGroup('target-select', (v) => { this.config.targetKills = Number(v); });
    bindGroup('diff-select', (v) => { this.config.difficulty = v as MatchConfig['difficulty']; });

    const sensSlider = document.getElementById('sens-slider') as HTMLInputElement;
    sensSlider.addEventListener('input', () => {
      this.config.sensitivity = Number(sensSlider.value);
      document.getElementById('sens-val')!.textContent = this.config.sensitivity.toFixed(1);
    });

    document.getElementById('start-btn')!.addEventListener('click', () => {
      this.sound.unlock();
      this.startMatch();
    });

    document.getElementById('preview-ship-btn')!.addEventListener('click', () => {
      this.sound.unlock();
      this.enterOverview('lobby');
    });

    document.getElementById('exit-overview-btn')!.addEventListener('click', () => {
      this.exitOverview();
    });

    document.getElementById('resume-btn')!.addEventListener('click', () => {
      this.sound.unlock();
      this.resumeMatch();
    });

    document.getElementById('pause-overview-btn')!.addEventListener('click', () => {
      this.enterOverview('paused');
    });

    document.getElementById('back-lobby-btn')!.addEventListener('click', () => {
      this.returnToLobby();
    });

    document.getElementById('rematch-btn')!.addEventListener('click', () => {
      this.startMatch();
    });

    document.getElementById('result-lobby-btn')!.addEventListener('click', () => {
      this.returnToLobby();
    });

    // In-game Bag Drawer Buttons
    document.querySelectorAll('#bag-switcher-drawer .bag-opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number((btn as HTMLElement).dataset.bag);
        this.selectBag(idx);
      });
    });

    // Pointer Lock Change
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (!locked && this.phase === 'playing' && !this.touch.isTouchDevice) {
        this.phase = 'paused';
        document.getElementById('pause-overlay')!.classList.remove('hidden');
      }
    });

    // Mouse Look & Fire
    window.addEventListener('mousemove', (e) => {
      if (this.phase === 'playing' && document.pointerLockElement === this.canvas) {
        const zoomSlowdown = this.scopeStage === 2 ? 0.28 : this.scopeStage === 1 ? 0.55 : 1.0;
        const mult = 0.0021 * this.config.sensitivity * zoomSlowdown;
        this.playerYaw -= e.movementX * mult;
        this.playerPitch = THREE.MathUtils.clamp(
          this.playerPitch - e.movementY * mult,
          -Math.PI / 2 + 0.04,
          Math.PI / 2 - 0.04
        );
        this.frameLookDX += e.movementX;
        this.frameLookDY += e.movementY;
      } else if (this.phase === 'overview' && this.orbitDragging) {
        this.orbitYaw -= (e.clientX - this.orbitLastX) * 0.006;
        this.orbitPitch = THREE.MathUtils.clamp(
          this.orbitPitch + (e.clientY - this.orbitLastY) * 0.006,
          0.12,
          1.42
        );
        this.orbitLastX = e.clientX;
        this.orbitLastY = e.clientY;
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (this.phase === 'overview') {
        this.orbitDragging = true;
        this.orbitLastX = e.clientX;
        this.orbitLastY = e.clientY;
        return;
      }
      if (this.phase !== 'playing') return;
      if (!this.touch.isTouchDevice && document.pointerLockElement !== this.canvas) {
        this.safePointerLock();
        return;
      }
      if (e.button === 0) {
        this.mouseDownLeft = true;
        this.tryPrimaryAction(true);
      } else if (e.button === 2) {
        this.handleSecondaryAction();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDownLeft = false;
      this.orbitDragging = false;
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener(
      'wheel',
      (e) => {
        if (this.phase === 'overview') {
          this.orbitDist = THREE.MathUtils.clamp(this.orbitDist + e.deltaY * 0.05, 24, 135);
        } else if (this.phase === 'playing' && this.playerAlive) {
          const order: WeaponSlot[] = this.hasGrenade ? [1, 2, 3, 4] : [1, 2, 3];
          const curIdx = order.indexOf(this.activeSlot);
          const nextIdx = (curIdx + (e.deltaY > 0 ? 1 : -1) + order.length) % order.length;
          this.switchSlot(order[nextIdx]);
        }
      },
      { passive: true }
    );

    // Keyboard Controls
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        if (this.phase === 'playing' || this.phase === 'paused') {
          this.updateScoreboardUI();
          document.getElementById('tab-scoreboard')!.classList.remove('hidden');
        }
        return;
      }

      this.keys.add(e.code);

      if (e.code === 'KeyP') {
        if (this.phase === 'playing') {
          this.enterOverview('playing');
        } else if (this.phase === 'overview') {
          this.exitOverview();
        }
        return;
      }

      if (this.phase !== 'playing') return;

      if (e.code === 'KeyB') {
        this.toggleBagDrawer();
        return;
      }

      if (this.bagDrawerOpen && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
        const idx = Number(e.code.replace('Digit', '')) - 1;
        this.selectBag(idx);
        return;
      }

      if (!this.playerAlive) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.tryJump();
      } else if (e.code === 'Digit1') {
        this.switchSlot(1);
      } else if (e.code === 'Digit2') {
        this.switchSlot(2);
      } else if (e.code === 'Digit3') {
        this.switchSlot(3);
      } else if (e.code === 'Digit4') {
        if (this.hasGrenade) this.switchSlot(4);
      } else if (e.code === 'KeyQ') {
        this.quickSwitchWeapon();
      } else if (e.code === 'KeyR') {
        this.startReload();
      } else if (e.code === 'KeyG') {
        this.quickThrowGrenade();
      } else if (e.code === 'KeyC') {
        this.toggleCrouch = !this.toggleCrouch;
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Tab') {
        document.getElementById('tab-scoreboard')!.classList.add('hidden');
      }
      this.keys.delete(e.code);
    });
  }

  private startMatch(): void {
    if (!this.assetsReady) return;
    document.getElementById('lobby-overlay')!.classList.add('hidden');
    document.getElementById('pause-overlay')!.classList.add('hidden');
    document.getElementById('result-overlay')!.classList.add('hidden');
    document.getElementById('overview-banner')!.classList.add('hidden');
    document.getElementById('kill-feed')!.innerHTML = '';

    // Rebuild first-person sleeves for chosen team
    this.weaponCamera.remove(this.viewmodel.root);
    this.camera.remove(this.viewmodel.worldMuzzleLight);
    this.viewmodel = new FirstPersonViewmodel(this.config.playerTeam, this.assets);
    this.weaponCamera.add(this.viewmodel.root);
    this.camera.add(this.viewmodel.worldMuzzleLight);

    this.scoreGR = 0;
    this.scoreBL = 0;
    this.matchTimer = 600;
    this.playerKills = 0;
    this.playerDeaths = 0;
    this.playerHeadshots = 0;
    this.playerMultiKill = 0;
    this.firstBloodTaken = false;
    this.currentBagIndex = this.config.initialBag;
    this.pendingBagIndex = this.config.initialBag;

    // Spawn 5v5 or 8v8 Bots (teamSize - 1 allies + teamSize enemies!)
    this.bots.forEach((b) => b.destroy(this.scene));
    this.bots = [];

    const pTeam = this.config.playerTeam;
    const eTeam: TeamId = pTeam === 'GR' ? 'BL' : 'GR';
    for (let i = 0; i < this.config.teamSize - 1; i++) {
      const sp = this.shipWorld.spawns[pTeam][(i + 1) % this.shipWorld.spawns[pTeam].length];
      this.bots.push(new BotSoldier(i, pTeam, true, this.scene, sp, this.assets));
    }
    for (let i = 0; i < this.config.teamSize; i++) {
      const sp = this.shipWorld.spawns[eTeam][i % this.shipWorld.spawns[eTeam].length];
      this.bots.push(new BotSoldier(i, eTeam, false, this.scene, sp, this.assets));
    }

    this.respawnPlayer();
    this.phase = 'playing';
    this.hud.showHud(true);
    document.getElementById('radar-panel')!.classList.remove('hidden');
    document.getElementById('status-panel')!.classList.remove('hidden');
    document.getElementById('weapon-panel')!.classList.remove('hidden');
    document.getElementById('top-score-bar')!.classList.remove('hidden');
    this.touch.setVisible(true);
    this.hud.showNotice(
      `已部署至【${pTeam === 'GR' ? '保卫者' : '潜伏者'}】阵营 · 率先达成 ${this.config.targetKills} 杀获胜!`,
      3.2
    );

    this.safePointerLock();
  }

  private resumeMatch(): void {
    document.getElementById('pause-overlay')!.classList.add('hidden');
    document.getElementById('radar-panel')!.classList.remove('hidden');
    document.getElementById('status-panel')!.classList.remove('hidden');
    document.getElementById('weapon-panel')!.classList.remove('hidden');
    document.getElementById('top-score-bar')!.classList.remove('hidden');
    this.phase = 'playing';
    this.hud.showHud(true);
    this.touch.setVisible(true);
    this.safePointerLock();
  }

  private returnToLobby(): void {
    document.exitPointerLock?.();
    this.phase = 'lobby';
    this.hud.showHud(false);
    this.hud.setScopeState(false);
    this.hud.setCrosshairGap(6, true);
    this.touch.setVisible(false);
    document.getElementById('pause-overlay')!.classList.add('hidden');
    document.getElementById('result-overlay')!.classList.add('hidden');
    document.getElementById('overview-banner')!.classList.add('hidden');
    document.getElementById('lobby-overlay')!.classList.remove('hidden');
    this.camera.fov = 75;
    this.camera.updateProjectionMatrix();
    this.viewmodel.root.visible = false;
  }

  private enterOverview(from: GamePhase): void {
    this.returnPhaseAfterOverview = from;
    document.exitPointerLock?.();
    this.phase = 'overview';
    document.getElementById('lobby-overlay')!.classList.add('hidden');
    document.getElementById('pause-overlay')!.classList.add('hidden');
    this.hud.showHud(true);
    document.getElementById('radar-panel')!.classList.add('hidden');
    document.getElementById('status-panel')!.classList.add('hidden');
    document.getElementById('weapon-panel')!.classList.add('hidden');
    document.getElementById('top-score-bar')!.classList.toggle('hidden', from === 'lobby');
    this.hud.setScopeState(false);
    this.hud.setCrosshairGap(6, true);
    document.getElementById('overview-banner')!.classList.remove('hidden');
    this.viewmodel.root.visible = false;
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
  }

  private exitOverview(): void {
    document.getElementById('overview-banner')!.classList.add('hidden');
    document.getElementById('radar-panel')!.classList.remove('hidden');
    document.getElementById('status-panel')!.classList.remove('hidden');
    document.getElementById('weapon-panel')!.classList.remove('hidden');
    document.getElementById('top-score-bar')!.classList.remove('hidden');
    if (this.returnPhaseAfterOverview === 'lobby') {
      this.returnToLobby();
    } else {
      this.viewmodel.root.visible = true;
      this.resumeMatch();
    }
  }

  private respawnPlayer(): void {
    this.currentBagIndex = this.pendingBagIndex;
    const bag = LOADOUT_BAGS[this.currentBagIndex];
    const primarySpec = WEAPONS[bag.primary];
    const secSpec = WEAPONS[bag.secondary];

    this.ammoMag = { 1: primarySpec.magSize, 2: secSpec.magSize, 3: 1, 4: 1 };
    this.ammoRes = { 1: primarySpec.reserveAmmo, 2: secSpec.reserveAmmo, 3: 0, 4: 0 };
    this.hasGrenade = true;

    const spawns = this.shipWorld.spawns[this.config.playerTeam];
    const sp = spawns[0];
    // Align cleanly with wide main doorway (X = ±6.6) so walking straight ahead exits onto the container deck!
    this.playerState.x = (this.config.playerTeam === 'GR' ? -6.6 : 6.6) + (Math.random() - 0.5) * 1.2;
    this.playerState.y = sp.y;
    this.playerState.z = sp.z;
    this.playerState.vx = 0;
    this.playerState.vy = 0;
    this.playerState.vz = 0;
    this.playerYaw = sp.yaw;
    this.playerPitch = 0;

    this.playerHp = 100;
    this.playerArmor = 100;
    this.playerAlive = true;
    this.playerInvuln = 3.0;
    this.reloadTimer = 0;
    this.setScope(0);
    this.bagDrawerOpen = false;
    document.getElementById('bag-switcher-drawer')!.classList.add('hidden');
    document.getElementById('respawn-banner')!.classList.add('hidden');
    document.getElementById('damage-vignette')!.style.opacity = '0';

    this.viewmodel.root.visible = true;
    this.activeSlot = 1;
    this.lastSlot = 3;
    this.equipCurrentSlot();
  }

  private isPlayerInOwnSpawnBunker(): boolean {
    if (this.config.playerTeam === 'GR') {
      return this.playerState.z > 33.2 && Math.abs(this.playerState.x) < 12.8;
    }
    return this.playerState.z < -33.2 && Math.abs(this.playerState.x) < 12.8;
  }

  private toggleBagDrawer(): void {
    this.bagDrawerOpen = !this.bagDrawerOpen;
    document.getElementById('bag-switcher-drawer')!.classList.toggle('hidden', !this.bagDrawerOpen);
  }

  private selectBag(idx: number): void {
    this.pendingBagIndex = idx;
    this.bagDrawerOpen = false;
    document.getElementById('bag-switcher-drawer')!.classList.add('hidden');

    if (this.playerAlive && this.isPlayerInOwnSpawnBunker()) {
      this.currentBagIndex = idx;
      const bag = LOADOUT_BAGS[idx];
      this.ammoMag[1] = WEAPONS[bag.primary].magSize;
      this.ammoRes[1] = WEAPONS[bag.primary].reserveAmmo;
      this.activeSlot = 1;
      this.equipCurrentSlot();
      this.hud.showNotice(`已切换至 ${bag.name}`, 1.8);
    } else {
      this.hud.showNotice(`已预约 ${LOADOUT_BAGS[idx].name} (下次复活或回基地生效)`, 2.2);
    }
  }

  private getWeaponForSlot(slot: WeaponSlot): WeaponId {
    const bag = LOADOUT_BAGS[this.currentBagIndex];
    if (slot === 1) return bag.primary;
    if (slot === 2) return bag.secondary;
    if (slot === 3) return bag.melee;
    return bag.grenade;
  }

  private switchSlot(slot: WeaponSlot): void {
    if (slot === this.activeSlot) return;
    if (slot === 4 && !this.hasGrenade) return;
    this.lastSlot = this.activeSlot;
    this.activeSlot = slot;
    this.equipCurrentSlot();
  }

  private quickSwitchWeapon(): void {
    const target = this.lastSlot === 4 && !this.hasGrenade ? 1 : this.lastSlot;
    this.switchSlot(target);
  }

  private equipCurrentSlot(): void {
    const wId = this.getWeaponForSlot(this.activeSlot);
    const spec = WEAPONS[wId];
    this.reloadTimer = 0;
    this.boltRezoomTimer = 0;
    this.wasScopedBeforeBolt = false;
    this.setScope(0);
    this.drawCooldown = spec.drawTime;
    this.fireCooldown = spec.drawTime * 0.75;
    this.viewmodel.equip(wId, spec.drawTime);
    if (wId === 'kukri') {
      this.sound.playKnifeDraw();
    }
  }

  private setScope(stage: number): void {
    this.scopeStage = stage;
    const wId = this.getWeaponForSlot(this.activeSlot);
    const zooms = WEAPONS[wId].zoomLevels;
    if (stage === 0 || !zooms) {
      this.camera.fov = 75;
      this.camera.updateProjectionMatrix();
      this.hud.setScopeState(false);
      this.viewmodel.setScopedHidden(false);
    } else {
      const zFactor = zooms[Math.min(zooms.length - 1, stage - 1)];
      this.camera.fov = 75 / zFactor;
      this.camera.updateProjectionMatrix();
      this.hud.setScopeState(true, zFactor);
      this.viewmodel.setScopedHidden(true);
    }
  }

  private handleSecondaryAction(): void {
    if (!this.playerAlive || this.reloadTimer > 0 || this.drawCooldown > 0) return;
    const wId = this.getWeaponForSlot(this.activeSlot);
    const spec = WEAPONS[wId];

    if (spec.category === 'sniper') {
      const next = (this.scopeStage + 1) % 3;
      this.setScope(next);
      this.sound.playHitConfirm(false);
    } else if (spec.category === 'melee') {
      // Kukri Heavy Lethal Lunge ("尼泊尔重刀一击必杀!")
      if (this.fireCooldown <= 0) {
        this.performMeleeAttack(true);
      }
    }
  }

  private tryJump(): void {
    if (!this.playerAlive) return;
    if (this.playerState.grounded) {
      // Classic CF crouch-jump gives slight extra box-clearing boost ("蹲跳上高箱")
      const crouchHeld = this.keys.has('ControlLeft') || this.keys.has('KeyC') || this.toggleCrouch;
      this.playerState.vy = crouchHeld ? 7.35 : 6.95;
      this.playerState.grounded = false;
    }
  }

  private startReload(): void {
    if (!this.playerAlive || this.reloadTimer > 0) return;
    const wId = this.getWeaponForSlot(this.activeSlot);
    const spec = WEAPONS[wId];
    if (spec.category === 'melee' || spec.category === 'grenade') return;
    if (this.ammoMag[this.activeSlot] >= spec.magSize || this.ammoRes[this.activeSlot] <= 0) return;

    this.setScope(0);
    this.reloadTotal = spec.reloadTime;
    this.reloadTimer = spec.reloadTime;
    this.viewmodel.triggerReload(spec.reloadTime);
    this.sound.playReload(spec.reloadTime);
  }

  private quickThrowGrenade(): void {
    if (!this.playerAlive || !this.hasGrenade) return;
    if (this.activeSlot !== 4) {
      this.switchSlot(4);
    }
    setTimeout(() => {
      if (this.phase === 'playing' && this.playerAlive && this.activeSlot === 4 && this.hasGrenade) {
        this.throwPlayerGrenade();
      }
    }, 180);
  }

  private throwPlayerGrenade(): void {
    if (!this.hasGrenade) return;
    this.hasGrenade = false;
    this.ammoMag[4] = 0;
    this.playerInvuln = 0;

    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    dir.y += 0.14;
    dir.normalize();
    const origin = this.camera.position.clone().addScaledVector(dir, 0.45);
    this.effects.throwGrenade(origin, dir.multiplyScalar(18.5), 'player', this.config.playerTeam);
    this.sound.playFireInTheHoleRadio();
    this.hud.showNotice('Fire in the hole! · 高爆手雷已投出', 1.5);

    setTimeout(() => {
      if (this.playerAlive && this.activeSlot === 4) {
        this.switchSlot(1);
      }
    }, 260);
  }

  private performMeleeAttack(heavy: boolean): void {
    const spec = WEAPONS.kukri;
    this.playerInvuln = 0;
    this.fireCooldown = heavy ? 0.72 : 0.44;
    this.viewmodel.triggerSlash(heavy);
    this.sound.playWeaponFire('kukri');

    const reach = heavy ? 2.95 : 2.35;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const targets = this.buildEnemyTargetList(this.config.playerTeam);
    const cast = this.collision.castBulletRay(this.camera.position, dir, reach, 0, targets, 'player');

    if (cast.entityHit) {
      const bot = this.bots.find((b) => b.id === cast.entityHit!.entityId);
      if (bot) {
        const isHs = cast.entityHit.zone === 'head';
        const dmg = heavy ? (spec.heavyDamage ?? 145) : isHs ? spec.damageHead : spec.damageChest;
        this.applyPlayerHitToBot(bot, dmg, isHs, false, 'kukri', new THREE.Vector3(cast.entityHit.pointX, cast.entityHit.pointY, cast.entityHit.pointZ));
      }
    } else if (cast.impacts.length > 0) {
      const imp = cast.impacts[0];
      this.effects.spawnImpact(imp.point, imp.normal, imp.material);
      this.sound.playImpact(imp.material, 0, 0.55);
    }
  }

  private tryPrimaryAction(justClicked: boolean): void {
    if (!this.playerAlive || this.reloadTimer > 0 || this.drawCooldown > 0 || this.fireCooldown > 0) {
      return;
    }

    const wId = this.getWeaponForSlot(this.activeSlot);
    const spec = WEAPONS[wId];
    if (!spec.automatic && !justClicked) return;

    if (spec.category === 'melee') {
      this.performMeleeAttack(false);
      return;
    }
    if (spec.category === 'grenade') {
      this.throwPlayerGrenade();
      return;
    }

    if (this.ammoMag[this.activeSlot] <= 0) {
      this.startReload();
      return;
    }

    // Consume round & break spawn protection
    this.ammoMag[this.activeSlot]--;
    this.playerInvuln = 0;
    this.fireCooldown = spec.boltTime ?? 60 / spec.rpm;

    // Sniper bolt-action un-scopes briefly during bolt cycle (or press Q to quick-switch!)
    const firedWhileScoped = this.scopeStage;
    if (spec.boltTime) {
      this.wasScopedBeforeBolt = firedWhileScoped > 0;
      if (firedWhileScoped > 0) {
        this.setScope(0);
        this.boltRezoomTimer = spec.boltTime;
      }
      this.sound.playBoltCycle();
    }

    this.sound.playWeaponFire(wId, 0, 1.0);
    this.viewmodel.triggerFire(Boolean(spec.suppressed), spec.boltTime ?? 0);

    // Eject brass shell casing
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const shellOrigin = this.camera.position
      .clone()
      .addScaledVector(forward, 0.35)
      .addScaledVector(right, 0.22)
      .addScaledVector(up, -0.12);
    this.effects.spawnShellCasing(shellOrigin, right, up);

    // Compute accurate CF ballistic spread
    const horizSpeed = Math.hypot(this.playerState.vx, this.playerState.vz);
    const crouchMult = this.isPlayerCrouching() ? 0.55 : 1.0;
    const airMult = this.playerState.grounded ? 1.0 : 2.6;
    let spread = (spec.baseSpread + (horizSpeed / 6.0) * spec.moveSpread) * crouchMult * airMult;
    if (spec.category === 'sniper' && firedWhileScoped > 0) {
      spread = horizSpeed > 1.5 ? 0.008 : 0.00035; // Pinpoint laser accuracy when scoped & still!
    }

    const shotDir = forward.clone();
    shotDir.x += (Math.random() - 0.5) * spread * 2;
    shotDir.y += (Math.random() - 0.5) * spread * 2;
    shotDir.z += (Math.random() - 0.5) * spread * 2;
    shotDir.normalize();

    // Raycast against ship geometry + wood crates + enemy hitboxes
    const targets = this.buildEnemyTargetList(this.config.playerTeam);
    const cast = this.collision.castBulletRay(
      this.camera.position,
      shotDir,
      140,
      spec.woodPenetration,
      targets,
      'player'
    );

    // Muzzle tracer
    const tracerStart = this.camera.position
      .clone()
      .addScaledVector(forward, 0.65)
      .addScaledVector(right, firedWhileScoped > 0 ? 0 : 0.16)
      .addScaledVector(up, firedWhileScoped > 0 ? -0.02 : -0.11);
    this.effects.spawnTracer(tracerStart, cast.endPoint, wId === 'barrett' ? 0xff9e44 : 0xffe494);

    // Surface impacts (including wood crate entry & exit holes!)
    for (const imp of cast.impacts) {
      this.effects.spawnImpact(imp.point, imp.normal, imp.material);
      if (!imp.isExit) {
        const d = imp.point.distanceTo(this.camera.position);
        this.sound.playImpact(imp.material, 0, Math.max(0.12, 1 - d / 55) * 0.5);
      }
    }

    // Enemy hit processing
    if (cast.entityHit) {
      const bot = this.bots.find((b) => b.id === cast.entityHit!.entityId);
      if (bot) {
        const zone = cast.entityHit.zone;
        const baseDmg =
          zone === 'head'
            ? spec.damageHead
            : zone === 'chest'
            ? spec.damageChest
            : spec.damageLimb;
        const finalDmg = baseDmg * cast.entityHit.penetrationScale;
        this.applyPlayerHitToBot(
          bot,
          finalDmg,
          zone === 'head',
          cast.entityHit.penetrated,
          wId,
          new THREE.Vector3(cast.entityHit.pointX, cast.entityHit.pointY, cast.entityHit.pointZ)
        );
      }
    }

    // Apply crisp recoil kick
    this.recoilOffsetPitch += spec.recoilPitch;
    this.recoilOffsetYaw += (Math.random() - 0.5) * spec.recoilYaw * 2;
    if (wId === 'barrett') this.screenShake = 0.22;

    if (this.ammoMag[this.activeSlot] === 0 && this.ammoRes[this.activeSlot] > 0 && !spec.boltTime) {
      this.startReload();
    }
  }

  private applyPlayerHitToBot(
    bot: BotSoldier,
    damage: number,
    headshot: boolean,
    wallbang: boolean,
    weaponId: WeaponId,
    hitPoint: THREE.Vector3
  ): void {
    if (bot.invulnTimer > 0) {
      this.hud.showNotice('目标处于复活无敌保护中!', 0.9);
      return;
    }

    this.hud.triggerHitmarker(headshot);
    this.sound.playHitConfirm(headshot);
    this.effects.spawnBloodBurst(hitPoint, headshot);

    const killed = bot.applyDamage(damage, headshot);
    if (killed) {
      this.playerKills++;
      if (headshot) this.playerHeadshots++;
      this.playerMultiKill = this.playerMultiKillTimer > 0 ? this.playerMultiKill + 1 : 1;
      this.playerMultiKillTimer = 4.6;

      const isFirstBlood = !this.firstBloodTaken;
      this.firstBloodTaken = true;

      this.addTeamScore(this.config.playerTeam);
      this.sound.playKillStreakStinger(this.playerMultiKill, headshot);
      this.hud.showKillMedal(
        this.playerMultiKill,
        headshot,
        wallbang,
        weaponId === 'kukri',
        weaponId === 'he_grenade',
        isFirstBlood
      );
      this.hud.pushKillFeed(
        '我方特种兵 (YOU)',
        this.config.playerTeam,
        bot.name,
        bot.team,
        weaponId,
        headshot,
        wallbang,
        true
      );
    }
  }

  private handleGrenadeDetonation(pos: THREE.Vector3, ownerId: string, ownerTeam: TeamId): void {
    const distToListener = pos.distanceTo(this.camera.position);
    const pan = this.computeStereoPan(pos);
    this.sound.playGrenadeExplosion(pan, Math.max(0.12, 1 - distToListener / 58));
    if (distToListener < 18) {
      this.screenShake = Math.max(this.screenShake, (1 - distToListener / 18) * 0.45);
    }

    const blastRadius = 6.4;

    // Damage enemies of ownerTeam
    for (const bot of this.bots) {
      if (!bot.alive || bot.team === ownerTeam || bot.invulnTimer > 0) continue;
      const bPos = new THREE.Vector3(bot.state.x, bot.state.y + 0.9, bot.state.z);
      const d = bPos.distanceTo(pos);
      if (d <= blastRadius) {
        const los = this.collision.hasLineOfSight(pos.x, pos.y + 0.25, pos.z, bPos.x, bPos.y, bPos.z, true);
        if (los.clear) {
          const dmg = (1 - d / blastRadius) * 118;
          if (ownerId === 'player') {
            this.applyPlayerHitToBot(bot, dmg, false, false, 'he_grenade', bPos);
          } else {
            const killerBot = this.bots.find((k) => k.id === ownerId);
            if (bot.applyDamage(dmg, false)) {
              if (killerBot) killerBot.kills++;
              this.addTeamScore(ownerTeam);
              this.hud.pushKillFeed(
                killerBot?.name ?? '友军',
                ownerTeam,
                bot.name,
                bot.team,
                'he_grenade',
                false,
                false,
                false
              );
            }
          }
        }
      }
    }

    // Check blast on player if thrown by enemy bot
    if (ownerTeam !== this.config.playerTeam && this.playerAlive && this.playerInvuln <= 0) {
      const pPos = new THREE.Vector3(this.playerState.x, this.playerState.y + 0.9, this.playerState.z);
      const d = pPos.distanceTo(pos);
      if (d <= blastRadius) {
        const los = this.collision.hasLineOfSight(pos.x, pos.y + 0.25, pos.z, pPos.x, pPos.y, pPos.z, true);
        if (los.clear) {
          const killerBot = this.bots.find((k) => k.id === ownerId);
          this.damagePlayer((1 - d / blastRadius) * 92, pos, killerBot?.name ?? '潜伏者', ownerTeam, 'he_grenade', false, false);
        }
      }
    }
  }

  private damagePlayer(
    rawDamage: number,
    sourcePos: THREE.Vector3,
    attackerName: string,
    attackerTeam: TeamId,
    weaponId: WeaponId,
    headshot: boolean,
    wallbang: boolean
  ): void {
    if (!this.playerAlive || this.playerInvuln > 0) return;

    const absorbed = Math.min(this.playerArmor, Math.round(rawDamage * 0.25));
    this.playerArmor = Math.max(0, this.playerArmor - absorbed);
    const hpLoss = Math.max(1, Math.round(rawDamage * 0.85));
    this.playerHp = Math.max(0, this.playerHp - hpLoss);

    // Directional hit indicator relative to player facing
    const dx = sourcePos.x - this.playerState.x;
    const dz = sourcePos.z - this.playerState.z;
    const worldAngle = Math.atan2(-dx, -dz);
    const relAngle = this.playerYaw - worldAngle;
    this.hud.triggerDamageEffect(relAngle);
    this.screenShake = Math.max(this.screenShake, 0.14);

    if (this.playerHp <= 0) {
      this.playerAlive = false;
      this.playerDeaths++;
      this.playerRespawnTimer = 3.0;
      this.setScope(0);
      this.viewmodel.root.visible = false;

      const killerBot = this.bots.find((b) => b.name === attackerName && b.team === attackerTeam);
      if (killerBot) {
        killerBot.kills++;
        if (headshot) killerBot.headshots++;
      }

      this.addTeamScore(attackerTeam);
      this.hud.pushKillFeed(
        attackerName,
        attackerTeam,
        '我方特种兵 (YOU)',
        this.config.playerTeam,
        weaponId,
        headshot,
        wallbang,
        true
      );

      document.getElementById('respawn-killer-info')!.textContent =
        `被 ${attackerName} 使用 【${WEAPONS[weaponId].shortName}】 ${wallbang ? '穿箱' : ''}${headshot ? '爆头' : ''}击杀`;
      document.getElementById('respawn-banner')!.classList.remove('hidden');
    }
  }

  private addTeamScore(team: TeamId): void {
    if (this.phase === 'ended') return;
    if (team === 'GR') this.scoreGR++;
    else this.scoreBL++;

    if (this.scoreGR >= this.config.targetKills || this.scoreBL >= this.config.targetKills) {
      this.finishMatch();
    }
  }

  private finishMatch(): void {
    this.phase = 'ended';
    document.exitPointerLock?.();
    this.setScope(0);
    this.touch.setVisible(false);

    const playerWon =
      (this.config.playerTeam === 'GR' && this.scoreGR >= this.scoreBL) ||
      (this.config.playerTeam === 'BL' && this.scoreBL >= this.scoreGR);

    document.getElementById('result-badge')!.textContent = playerWon
      ? 'ACE VICTORY · 团队竞技胜利!'
      : 'DEFEAT · 惜败对手';
    document.getElementById('result-scoreline')!.textContent = `${this.scoreGR} : ${this.scoreBL}`;
    document.getElementById('result-stats')!.innerHTML = `
      <div>个人击杀: <b>${this.playerKills}</b></div>
      <div>阵亡次数: <b>${this.playerDeaths}</b></div>
      <div>黄金爆头: <b>${this.playerHeadshots}</b></div>
      <div>K/D 比: <b>${(this.playerKills / Math.max(1, this.playerDeaths)).toFixed(2)}</b></div>
    `;
    document.getElementById('result-overlay')!.classList.remove('hidden');
  }

  private buildEnemyTargetList(shooterTeam: TeamId): TargetableEntity[] {
    const out: TargetableEntity[] = [];
    for (const b of this.bots) {
      if (b.team !== shooterTeam && b.alive) {
        out.push({
          id: b.id,
          alive: true,
          x: b.state.x,
          y: b.state.y,
          z: b.state.z,
          crouching: b.crouching,
          canBeHit: true,
        });
      }
    }
    if (this.config.playerTeam !== shooterTeam && this.playerAlive) {
      out.push({
        id: 'player',
        alive: true,
        x: this.playerState.x,
        y: this.playerState.y,
        z: this.playerState.z,
        crouching: this.isPlayerCrouching(),
        canBeHit: true,
      });
    }
    return out;
  }

  private isPlayerCrouching(): boolean {
    return this.keys.has('ControlLeft') || this.keys.has('ControlRight') || this.keys.has('KeyC') || this.toggleCrouch;
  }

  private computeStereoPan(worldPos: THREE.Vector3): number {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const toSrc = worldPos.clone().sub(this.camera.position);
    const dist = toSrc.length();
    if (dist < 0.01) return 0;
    return THREE.MathUtils.clamp(toSrc.divideScalar(dist).dot(right), -0.95, 0.95);
  }

  private updateScoreboardUI(): void {
    const entries: ScoreboardEntry[] = [
      {
        name: '我方特种兵 (YOU)',
        team: this.config.playerTeam,
        weaponName: WEAPONS[LOADOUT_BAGS[this.currentBagIndex].primary].shortName,
        kills: this.playerKills,
        deaths: this.playerDeaths,
        headshots: this.playerHeadshots,
        ping: 9,
        isSelf: true,
      },
      ...this.bots.map((b) => ({
        name: b.name,
        team: b.team,
        weaponName: WEAPONS[b.weaponId].shortName,
        kills: b.kills,
        deaths: b.deaths,
        headshots: b.headshots,
        ping: b.ping,
        isSelf: false,
      })),
    ];
    this.hud.renderScoreboard(entries, this.scoreGR, this.scoreBL, this.config.targetKills);
  }

  private loop = (nowMs: number): void => {
    requestAnimationFrame(this.loop);

    const rawDt = (nowMs - this.lastFrameMs) / 1000;
    this.lastFrameMs = nowMs;
    const dt = Math.min(0.05, Math.max(0.001, rawDt));
    this.totalTime += dt;
    this.fpsSmooth = THREE.MathUtils.lerp(this.fpsSmooth, 1 / Math.max(0.001, rawDt), 0.08);

    if (!this.assetsReady) {
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Animate ocean waves & spinning bridge radar in all phases
    this.shipWorld.updateEnvironment(this.totalTime);

    if (this.phase === 'lobby') {
      // Cinematic aerial orbit around the 3D Transport Ship behind Lobby Menu!
      const angle = this.totalTime * 0.14;
      this.camera.position.set(Math.sin(angle) * 46, 21 + Math.sin(this.totalTime * 0.35) * 2.5, Math.cos(angle) * 52);
      this.camera.lookAt(0, 2.2, 0);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.phase === 'overview') {
      const cx = Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch) * this.orbitDist;
      const cy = Math.sin(this.orbitPitch) * this.orbitDist;
      const cz = Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch) * this.orbitDist;
      this.camera.position.set(cx, cy, cz);
      this.camera.lookAt(0, 1.5, 0);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.phase === 'playing') {
      this.stepActiveGameplay(dt);
    }

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (this.viewmodel.root.visible && this.scopeStage === 0) {
      this.renderer.clearDepth();
      this.renderer.render(this.weaponScene, this.weaponCamera);
    }
  };

  private stepActiveGameplay(dt: number): void {
    // Match Timer
    this.matchTimer = Math.max(0, this.matchTimer - dt);
    if (this.matchTimer <= 0) {
      this.finishMatch();
      return;
    }

    // Touch look delta
    const touchDelta = this.touch.consumeLookDelta();
    if (touchDelta.dx !== 0 || touchDelta.dy !== 0) {
      const zoomSlowdown = this.scopeStage === 2 ? 0.3 : this.scopeStage === 1 ? 0.55 : 1.0;
      const mult = 0.0024 * this.config.sensitivity * zoomSlowdown;
      this.playerYaw -= touchDelta.dx * mult;
      this.playerPitch = THREE.MathUtils.clamp(
        this.playerPitch - touchDelta.dy * mult,
        -Math.PI / 2 + 0.04,
        Math.PI / 2 - 0.04
      );
      this.frameLookDX += touchDelta.dx;
      this.frameLookDY += touchDelta.dy;
    }

    if (this.playerMultiKillTimer > 0) {
      this.playerMultiKillTimer = Math.max(0, this.playerMultiKillTimer - dt);
    }

    const activeWeapon = this.getWeaponForSlot(this.activeSlot);
    const weaponSpec = WEAPONS[activeWeapon];

    // Recoil recovery
    this.recoilOffsetPitch = THREE.MathUtils.lerp(
      this.recoilOffsetPitch,
      0,
      Math.min(1, dt * weaponSpec.recoilRecovery)
    );
    this.recoilOffsetYaw = THREE.MathUtils.lerp(
      this.recoilOffsetYaw,
      0,
      Math.min(1, dt * weaponSpec.recoilRecovery)
    );
    this.screenShake = Math.max(0, this.screenShake - dt * 1.4);

    // Player Alive vs Respawning
    if (!this.playerAlive) {
      this.playerRespawnTimer -= dt;
      document.getElementById('respawn-sec')!.textContent = Math.max(0, this.playerRespawnTimer).toFixed(1);
      // Death camera gently rises above body
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, this.playerState.y + 3.1, dt * 2.5);
      if (this.playerRespawnTimer <= 0) {
        this.respawnPlayer();
      }
    } else {
      if (this.playerInvuln > 0) {
        this.playerInvuln = Math.max(0, this.playerInvuln - dt);
      }
      if (this.fireCooldown > 0) this.fireCooldown = Math.max(0, this.fireCooldown - dt);
      if (this.drawCooldown > 0) this.drawCooldown = Math.max(0, this.drawCooldown - dt);

      // Auto re-zoom after sniper bolt cycle finishes (classic CF sniper feel!)
      if (this.boltRezoomTimer > 0) {
        this.boltRezoomTimer -= dt;
        if (this.boltRezoomTimer <= 0 && this.wasScopedBeforeBolt && weaponSpec.category === 'sniper') {
          this.setScope(1);
          this.wasScopedBeforeBolt = false;
        }
      }

      // Reload completion
      if (this.reloadTimer > 0) {
        this.reloadTimer -= dt;
        if (this.reloadTimer <= 0) {
          this.reloadTimer = 0;
          const needed = weaponSpec.magSize - this.ammoMag[this.activeSlot];
          const transfer = Math.min(needed, this.ammoRes[this.activeSlot]);
          this.ammoMag[this.activeSlot] += transfer;
          this.ammoRes[this.activeSlot] -= transfer;
        }
      }

      // Movement Wish Vector
      let moveForward = 0;
      let moveRight = 0;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveForward += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveForward -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveRight += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveRight -= 1;

      if (this.touch.isTouchDevice) {
        moveRight += this.touch.moveX;
        moveForward -= this.touch.moveZ;
      }

      const crouching = this.isPlayerCrouching();
      const silentWalk = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');

      let speed = 6.25 * weaponSpec.moveSpeedMult;
      if (crouching) speed *= 0.52;
      else if (silentWalk) speed *= 0.56;
      if (this.scopeStage > 0) speed *= 0.58;

      const fwdX = -Math.sin(this.playerYaw);
      const fwdZ = -Math.cos(this.playerYaw);
      const rgtX = Math.cos(this.playerYaw);
      const rgtZ = -Math.sin(this.playerYaw);

      let wishX = fwdX * moveForward + rgtX * moveRight;
      let wishZ = fwdZ * moveForward + rgtZ * moveRight;
      const len = Math.hypot(wishX, wishZ);
      if (len > 1) {
        wishX /= len;
        wishZ /= len;
      }
      wishX *= speed;
      wishZ *= speed;

      const charHeight = crouching ? 1.16 : 1.76;
      this.collision.moveCharacter(this.playerState, wishX, wishZ, dt, 0.37, charHeight);

      // Footsteps (suppressed when holding Shift silent-walk just like CF "静步摸点"!)
      const actualHoriz = Math.hypot(wishX, wishZ);
      if (this.playerState.grounded && actualHoriz > 1.3 && !silentWalk && !crouching) {
        this.footstepAccum += dt * (actualHoriz / 2.25);
        if (this.footstepAccum >= 1) {
          this.footstepAccum = 0;
          this.sound.playFootstep(this.playerState.groundMaterial, this.playerState.underground, 0, 0.3);
        }
      }

      // Smooth eye height + camera transform
      const targetEyeY = this.playerState.y + (crouching ? 1.04 : 1.66);
      this.camera.position.x = this.playerState.x + (Math.random() - 0.5) * this.screenShake * 0.08;
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetEyeY, Math.min(1, dt * 16));
      this.camera.position.z = this.playerState.z + (Math.random() - 0.5) * this.screenShake * 0.08;

      this.camera.rotation.y = this.playerYaw + this.recoilOffsetYaw;
      this.camera.rotation.x = THREE.MathUtils.clamp(
        this.playerPitch + this.recoilOffsetPitch,
        -Math.PI / 2 + 0.02,
        Math.PI / 2 - 0.02
      );

      // Continuous automatic firing
      if ((this.mouseDownLeft || this.touch.firing) && weaponSpec.automatic) {
        this.tryPrimaryAction(false);
      }

      // Viewmodel sway & bob
      this.viewmodel.update(dt, actualHoriz, this.playerState.grounded, this.frameLookDX, this.frameLookDY);
      this.frameLookDX = 0;
      this.frameLookDY = 0;

      // Dynamic Crosshair Bloom
      const gap =
        5 +
        actualHoriz * 1.15 +
        this.recoilOffsetPitch * 135 +
        (this.playerState.grounded ? 0 : 12);
      const hideCrosshair = this.scopeStage > 0 || weaponSpec.category === 'sniper';
      this.hud.setCrosshairGap(gap, hideCrosshair);
    }

    // Step All 5v5 / 8v8 Bots!
    this.stepBots(dt);

    // Step 3D Tracers, Sparks, Splinters, Brass Shells & Thrown HE Grenades
    this.effects.update(dt, this.collision, this.sound, this.camera.position, ({ pos, ownerId, ownerTeam }) => {
      this.handleGrenadeDetonation(pos, ownerId, ownerTeam);
    });

    // Update HUD & Live Tactical Radar
    const reloadProg =
      this.reloadTimer > 0 ? 1 - this.reloadTimer / Math.max(0.1, this.reloadTotal) : null;
    const bagPrimary = LOADOUT_BAGS[this.currentBagIndex].primary;

    this.hud.updateStatsAndTimers(
      dt,
      this.playerHp,
      this.playerArmor,
      this.playerInvuln,
      this.isPlayerCrouching(),
      this.currentBagIndex,
      this.activeSlot,
      activeWeapon,
      bagPrimary,
      this.ammoMag[this.activeSlot],
      this.ammoRes[this.activeSlot],
      this.hasGrenade,
      reloadProg,
      this.scoreGR,
      this.scoreBL,
      this.config.targetKills,
      this.matchTimer,
      this.playerState.zoneName,
      this.fpsSmooth
    );

    const radarBlips: RadarBlip[] = this.bots.map((b) => ({
      x: b.state.x,
      z: b.state.z,
      team: b.team,
      alive: b.alive,
      visibleOnRadar: b.radarRevealTimer > 0,
    }));
    this.hud.drawRadar(
      this.playerState.x,
      this.playerState.z,
      this.playerYaw,
      this.config.playerTeam,
      this.shipWorld.minimapContainers,
      radarBlips
    );
  }

  private stepBots(dt: number): void {
    for (const bot of this.bots) {
      const enemies: Array<{
        id: string;
        x: number;
        y: number;
        z: number;
        crouching: boolean;
        alive: boolean;
        invuln: boolean;
      }> = [];

      for (const other of this.bots) {
        if (other.team !== bot.team && other.alive) {
          enemies.push({
            id: other.id,
            x: other.state.x,
            y: other.state.y,
            z: other.state.z,
            crouching: other.crouching,
            alive: true,
            invuln: other.invulnTimer > 0,
          });
        }
      }

      if (this.config.playerTeam !== bot.team && this.playerAlive) {
        enemies.push({
          id: 'player',
          x: this.playerState.x,
          y: this.playerState.y,
          z: this.playerState.z,
          crouching: this.isPlayerCrouching(),
          alive: true,
          invuln: this.playerInvuln > 0,
        });
      }

      bot.update(
        dt,
        this.config.difficulty,
        this.collision,
        this.shipWorld.wayNodes,
        enemies,
        this.shipWorld.spawns[bot.team],
        (fireReq) => {
          const spec = WEAPONS[fireReq.weaponId];
          const dist = fireReq.origin.distanceTo(this.camera.position);
          const pan = this.computeStereoPan(fireReq.origin);
          this.sound.playWeaponFire(fireReq.weaponId, pan, Math.max(0.06, 1 - dist / 72) * 0.72);

          const targets = this.buildEnemyTargetList(bot.team);
          const cast = this.collision.castBulletRay(
            fireReq.origin,
            fireReq.dir,
            135,
            spec.woodPenetration,
            targets,
            bot.id
          );

          this.effects.spawnTracer(
            fireReq.origin,
            cast.endPoint,
            bot.team === 'GR' ? 0x9bd6ff : 0xffcb85
          );

          for (const imp of cast.impacts) {
            if (!imp.isExit) {
              this.effects.spawnImpact(imp.point, imp.normal, imp.material);
            }
          }

          if (cast.entityHit) {
            const zone = cast.entityHit.zone;
            const rawDmg =
              (zone === 'head'
                ? spec.damageHead
                : zone === 'chest'
                ? spec.damageChest
                : spec.damageLimb) *
              cast.entityHit.penetrationScale *
              (this.config.difficulty === 'easy' ? 0.52 : this.config.difficulty === 'normal' ? 0.72 : 0.92);

            if (cast.entityHit.entityId === 'player') {
              this.damagePlayer(
                rawDmg,
                fireReq.origin,
                bot.name,
                bot.team,
                fireReq.weaponId,
                zone === 'head',
                cast.entityHit.penetrated
              );
            } else {
              const victimBot = this.bots.find((v) => v.id === cast.entityHit!.entityId);
              if (victimBot && victimBot.invulnTimer <= 0) {
                this.effects.spawnBloodBurst(
                  new THREE.Vector3(cast.entityHit.pointX, cast.entityHit.pointY, cast.entityHit.pointZ),
                  zone === 'head'
                );
                if (victimBot.applyDamage(rawDmg, zone === 'head')) {
                  bot.kills++;
                  if (zone === 'head') bot.headshots++;
                  this.firstBloodTaken = true;
                  this.addTeamScore(bot.team);
                  this.hud.pushKillFeed(
                    bot.name,
                    bot.team,
                    victimBot.name,
                    victimBot.team,
                    fireReq.weaponId,
                    zone === 'head',
                    cast.entityHit.penetrated,
                    false
                  );
                }
              }
            }
          }
        },
        (nadeReq) => {
          this.effects.throwGrenade(nadeReq.origin, nadeReq.vel, nadeReq.bot.id, nadeReq.bot.team);
        },
        (stepBot) => {
          const bPos = new THREE.Vector3(stepBot.state.x, stepBot.state.y, stepBot.state.z);
          const dist = bPos.distanceTo(this.camera.position);
          if (dist < 24) {
            const pan = this.computeStereoPan(bPos);
            this.sound.playFootstep(
              stepBot.state.groundMaterial,
              stepBot.state.underground,
              pan,
              (1 - dist / 24) * 0.25
            );
          }
        }
      );
    }
  }
}
