import { LOADOUT_BAGS, WEAPONS } from '../weapons/weaponDefs';
import { TeamId, WeaponId, WeaponSlot } from '../types';

export interface RadarBlip {
  x: number;
  z: number;
  team: TeamId;
  alive: boolean;
  visibleOnRadar: boolean;
}

export interface ScoreboardEntry {
  name: string;
  team: TeamId;
  weaponName: string;
  kills: number;
  deaths: number;
  headshots: number;
  ping: number;
  isSelf: boolean;
}

export class HudController {
  private readonly radarCanvas: HTMLCanvasElement;
  private readonly radarCtx: CanvasRenderingContext2D;

  private hitmarkerTimer = 0;
  private medalTimer = 0;
  private noticeTimer = 0;
  private vignetteTimer = 0;

  constructor() {
    this.radarCanvas = document.getElementById('radar-canvas') as HTMLCanvasElement;
    this.radarCtx = this.radarCanvas.getContext('2d')!;
  }

  public showHud(visible: boolean): void {
    document.getElementById('hud')!.classList.toggle('hidden', !visible);
  }

  public setCrosshairGap(gapPx: number, hidden: boolean): void {
    const ch = document.getElementById('crosshair')!;
    ch.classList.toggle('hidden', hidden);
    ch.style.setProperty('--gap', `${Math.round(gapPx)}px`);
  }

  public setScopeState(scoped: boolean, zoomFactor = 2.6): void {
    const sc = document.getElementById('sniper-scope')!;
    sc.classList.toggle('hidden', !scoped);
    if (scoped) {
      document.getElementById('scope-zoom-label')!.textContent = `OPTIC ZOOM ${zoomFactor.toFixed(1)}x`;
    }
  }

  public triggerHitmarker(headshot: boolean): void {
    const hm = document.getElementById('hitmarker')!;
    hm.classList.remove('hidden');
    hm.classList.toggle('headshot', headshot);
    this.hitmarkerTimer = headshot ? 0.24 : 0.14;
  }

  public triggerDamageEffect(attackerAngleRad: number): void {
    const vig = document.getElementById('damage-vignette')!;
    vig.style.opacity = '0.9';
    this.vignetteTimer = 0.35;

    const layer = document.getElementById('hit-direction-layer')!;
    const arc = document.createElement('div');
    arc.className = 'hit-arc';
    arc.style.transform = `rotate(${attackerAngleRad}rad)`;
    layer.appendChild(arc);
    setTimeout(() => {
      arc.style.opacity = '0';
      setTimeout(() => arc.remove(), 360);
    }, 320);
  }

  public showNotice(text: string, duration = 2.2): void {
    const el = document.getElementById('center-notice')!;
    el.textContent = text;
    el.classList.remove('hidden');
    this.noticeTimer = duration;
  }

  public showKillMedal(
    streak: number,
    headshot: boolean,
    wallbang: boolean,
    melee: boolean,
    grenade: boolean,
    firstBlood: boolean
  ): void {
    const box = document.getElementById('kill-medal-box')!;
    const svgWrap = document.getElementById('kill-medal-svg')!;
    const titleEl = document.getElementById('kill-medal-title')!;
    const subEl = document.getElementById('kill-medal-sub')!;

    let title = '击杀敌军';
    let sub = 'ELIMINATED';
    let primaryColor = '#f5b82e';
    let accentColor = '#fff0a6';

    if (firstBlood) {
      title = '第一滴血!';
      sub = 'FIRST BLOOD';
      primaryColor = '#ff5238';
    } else if (streak >= 6) {
      title = `${streak}连杀 · 超神暴走!`;
      sub = 'UNBELIEVABLE';
      primaryColor = '#ff3b2f';
    } else if (streak === 5) {
      title = '五连杀 · 无人能挡!';
      sub = 'UNSTOPPABLE';
      primaryColor = '#ff682b';
    } else if (streak === 4) {
      title = '四连杀 · 主宰战场!';
      sub = 'ULTRA KILL';
    } else if (streak === 3) {
      title = '三连杀 · 暴走连破!';
      sub = 'MULTI KILL';
    } else if (streak === 2) {
      title = '双连杀!';
      sub = 'DOUBLE KILL';
    } else if (melee) {
      title = '刀锋猎手!';
      sub = 'BLADE MASTER';
      primaryColor = '#57d4ff';
    } else if (grenade) {
      title = '高爆轰杀!';
      sub = 'GRENADE KILL';
      primaryColor = '#ff7b29';
    } else if (headshot && wallbang) {
      title = '穿箱黄金爆头!';
      sub = 'WALLBANG HEADSHOT';
    } else if (headshot) {
      title = '黄金爆头!';
      sub = 'GOLDEN HEADSHOT';
    } else if (wallbang) {
      title = '穿箱击杀!';
      sub = 'WALL PENETRATION';
      primaryColor = '#ffd056';
    }

    // Authentic CF Winged Star / Skull Emblem SVG
    const stars = Math.min(6, Math.max(1, streak));
    svgWrap.innerHTML = `
      <svg viewBox="0 0 120 90" width="96" height="76">
        <defs>
          <linearGradient id="cfGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${accentColor}" />
            <stop offset="55%" stop-color="${primaryColor}" />
            <stop offset="100%" stop-color="#8f4c06" />
          </linearGradient>
        </defs>
        <!-- Left & Right Tactical Wings -->
        <polygon points="8,24 44,36 38,52 14,44" fill="url(#cfGold)" stroke="#3a1c00" stroke-width="2"/>
        <polygon points="16,46 44,50 40,62 22,58" fill="url(#cfGold)" stroke="#3a1c00" stroke-width="1.5"/>
        <polygon points="112,24 76,36 82,52 106,44" fill="url(#cfGold)" stroke="#3a1c00" stroke-width="2"/>
        <polygon points="104,46 76,50 80,62 98,58" fill="url(#cfGold)" stroke="#3a1c00" stroke-width="1.5"/>
        <!-- Central CF Star / Hexagon Shield -->
        <polygon points="60,8 71,32 96,34 77,50 83,76 60,62 37,76 43,50 24,34 49,32"
          fill="url(#cfGold)" stroke="#fff3c4" stroke-width="2.2"/>
        <text x="60" y="52" text-anchor="middle" fill="#231200" font-size="20" font-weight="900" font-family="Impact,sans-serif">
          ${headshot ? '★' : stars + 'X'}
        </text>
      </svg>
    `;

    titleEl.textContent = title;
    subEl.textContent = sub;
    box.classList.remove('hidden');
    // Re-trigger pop animation
    box.style.animation = 'none';
    void box.offsetWidth;
    box.style.animation = '';
    this.medalTimer = 2.4;
  }

  public pushKillFeed(
    killerName: string,
    killerTeam: TeamId,
    victimName: string,
    victimTeam: TeamId,
    weaponId: WeaponId,
    headshot: boolean,
    wallbang: boolean,
    involvesSelf: boolean
  ): void {
    const feed = document.getElementById('kill-feed')!;
    const item = document.createElement('div');
    item.className = 'kf-item';
    const wShort = WEAPONS[weaponId].shortName;

    item.innerHTML = `
      <span class="${killerTeam === 'GR' ? 'kf-gr' : 'kf-bl'} ${involvesSelf ? 'kf-self' : ''}">${killerName}</span>
      <span class="kf-weapon">${wShort}</span>
      ${wallbang ? '<span class="kf-wallbang">穿箱</span>' : ''}
      ${headshot ? '<span class="kf-hs">★爆头</span>' : ''}
      <span class="${victimTeam === 'GR' ? 'kf-gr' : 'kf-bl'}">${victimName}</span>
    `;
    feed.appendChild(item);
    while (feed.children.length > 6) {
      feed.removeChild(feed.firstChild!);
    }
    setTimeout(() => {
      item.remove();
    }, 6500);
  }

  public updateStatsAndTimers(
    dt: number,
    hp: number,
    armor: number,
    invulnSec: number,
    crouching: boolean,
    bagIndex: number,
    activeSlot: WeaponSlot,
    activeWeapon: WeaponId,
    primaryWeapon: WeaponId,
    magAmmo: number,
    resAmmo: number,
    hasGrenade: boolean,
    reloadProgress: number | null,
    grScore: number,
    blScore: number,
    targetKills: number,
    matchTimeSec: number,
    zoneName: string,
    fps: number
  ): void {
    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer -= dt;
      if (this.hitmarkerTimer <= 0) {
        document.getElementById('hitmarker')!.classList.add('hidden');
      }
    }
    if (this.medalTimer > 0) {
      this.medalTimer -= dt;
      if (this.medalTimer <= 0) {
        document.getElementById('kill-medal-box')!.classList.add('hidden');
      }
    }
    if (this.noticeTimer > 0) {
      this.noticeTimer -= dt;
      if (this.noticeTimer <= 0) {
        document.getElementById('center-notice')!.classList.add('hidden');
      }
    }
    if (this.vignetteTimer > 0) {
      this.vignetteTimer -= dt;
      if (this.vignetteTimer <= 0) {
        document.getElementById('damage-vignette')!.style.opacity = hp < 30 ? '0.45' : '0';
      }
    }

    // Spawn protection pill & golden border
    const shieldPill = document.getElementById('spawn-protect-pill')!;
    const shieldVig = document.getElementById('spawn-shield-vignette')!;
    if (invulnSec > 0.05) {
      shieldPill.classList.remove('hidden');
      document.getElementById('spawn-protect-time')!.textContent = invulnSec.toFixed(1);
      shieldVig.style.opacity = '1';
    } else {
      shieldPill.classList.add('hidden');
      shieldVig.style.opacity = '0';
    }

    // HP & Armor
    const hpVal = document.getElementById('hud-hp')!;
    hpVal.textContent = String(Math.max(0, Math.round(hp)));
    hpVal.classList.toggle('low-hp', hp > 0 && hp <= 30);
    document.getElementById('hud-armor')!.textContent = String(Math.max(0, Math.round(armor)));

    const hpBar = document.getElementById('bar-hp')!;
    hpBar.style.width = `${Math.max(0, Math.min(100, hp))}%`;
    hpBar.classList.toggle('danger', hp <= 30);
    document.getElementById('bar-armor')!.style.width = `${Math.max(0, Math.min(100, armor))}%`;

    document.getElementById('stance-indicator')!.textContent = crouching ? '下蹲精准' : '站立机动';
    document.getElementById('bag-indicator')!.textContent = `背包 ${bagIndex + 1}`;

    // Weapon slots & ammo
    document.getElementById('slot1-name')!.textContent = WEAPONS[primaryWeapon].shortName;
    document.getElementById('slot4-name')!.textContent = hasGrenade ? '高爆手雷' : '已投掷';
    document.querySelectorAll('#weapon-slots .w-slot').forEach((el) => {
      const s = Number((el as HTMLElement).dataset.slot);
      el.classList.toggle('active', s === activeSlot);
    });

    const spec = WEAPONS[activeWeapon];
    document.getElementById('current-weapon-title')!.textContent = spec.name;
    if (spec.category === 'melee') {
      document.getElementById('hud-ammo-mag')!.textContent = '∞';
      document.getElementById('hud-ammo-res')!.textContent = '近战刀锋';
    } else if (spec.category === 'grenade') {
      document.getElementById('hud-ammo-mag')!.textContent = hasGrenade ? '1' : '0';
      document.getElementById('hud-ammo-res')!.textContent = '高爆破片';
    } else {
      document.getElementById('hud-ammo-mag')!.textContent = String(magAmmo);
      document.getElementById('hud-ammo-res')!.textContent = String(resAmmo);
    }

    const relWrap = document.getElementById('reload-bar-wrap')!;
    if (reloadProgress !== null) {
      relWrap.classList.remove('hidden');
      document.getElementById('reload-bar-fill')!.style.width = `${Math.round(reloadProgress * 100)}%`;
    } else {
      relWrap.classList.add('hidden');
    }

    // Scoreboard top bar
    document.getElementById('score-gr')!.textContent = String(grScore);
    document.getElementById('score-bl')!.textContent = String(blScore);
    document.getElementById('target-kills-label')!.textContent = String(targetKills);
    const mins = Math.floor(matchTimeSec / 60);
    const secs = Math.floor(matchTimeSec % 60);
    document.getElementById('match-timer')!.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    document.getElementById('zone-name')!.textContent = zoneName;
    document.getElementById('fps-counter')!.textContent = `${Math.round(fps)} FPS`;

    // Sync active bag button highlight
    document.querySelectorAll('#bag-switcher-drawer .bag-opt').forEach((btn) => {
      const idx = Number((btn as HTMLElement).dataset.bag);
      btn.classList.toggle('active', idx === bagIndex);
    });
  }

  public drawRadar(
    playerX: number,
    playerZ: number,
    playerYaw: number,
    playerTeam: TeamId,
    containers: Array<{ x: number; z: number; w: number; d: number; color: string }>,
    blips: RadarBlip[]
  ): void {
    const ctx = this.radarCtx;
    const w = this.radarCanvas.width;
    const h = this.radarCanvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#09131d';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    // Center on player and rotate so player's forward (-Z when yaw=0) points UP on the radar!
    ctx.translate(w / 2, h / 2);
    ctx.rotate(playerYaw);

    const scale = 2.45; // pixels per meter

    // Ship deck outline (-16.8..16.8 x -44..44)
    ctx.fillStyle = '#142433';
    ctx.strokeStyle = 'rgba(110, 165, 215, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.fillRect((-16.8 - playerX) * scale, (-44 - playerZ) * scale, 33.6 * scale, 88 * scale);
    ctx.strokeRect((-16.8 - playerX) * scale, (-44 - playerZ) * scale, 33.6 * scale, 88 * scale);

    // Underground tunnel dashed lanes
    ctx.strokeStyle = 'rgba(245, 175, 50, 0.28)';
    ctx.setLineDash([3, 3]);
    ctx.strokeRect((-16.4 - playerX) * scale, (-22.5 - playerZ) * scale, 3.2 * scale, 45 * scale);
    ctx.strokeRect((13.2 - playerX) * scale, (-22.5 - playerZ) * scale, 3.2 * scale, 45 * scale);
    ctx.setLineDash([]);

    // Containers & crates
    for (const c of containers) {
      ctx.fillStyle = c.color;
      ctx.globalAlpha = 0.72;
      ctx.fillRect(
        (c.x - c.w / 2 - playerX) * scale,
        (c.z - c.d / 2 - playerZ) * scale,
        c.w * scale,
        c.d * scale
      );
    }
    ctx.globalAlpha = 1.0;

    // Teammates & Firing Enemies
    for (const b of blips) {
      if (!b.alive) continue;
      const isAlly = b.team === playerTeam;
      if (!isAlly && !b.visibleOnRadar) continue;

      const bx = (b.x - playerX) * scale;
      const bz = (b.z - playerZ) * scale;
      ctx.fillStyle = isAlly ? '#3db8ff' : '#ff4438';
      ctx.beginPath();
      ctx.arc(bx, bz, isAlly ? 3.2 : 3.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Player FOV cone + Self green dot at center
    ctx.fillStyle = 'rgba(65, 255, 115, 0.14)';
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.arc(w / 2, h / 2, 46, -Math.PI / 2 - 0.52, -Math.PI / 2 + 0.52);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#38ff6c';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Subtle radar crosshair rings
    ctx.strokeStyle = 'rgba(130, 185, 230, 0.14)';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 42, 0, Math.PI * 2);
    ctx.arc(w / 2, h / 2, 78, 0, Math.PI * 2);
    ctx.stroke();
  }

  public renderScoreboard(entries: ScoreboardEntry[], grScore: number, blScore: number, targetKills: number): void {
    document.getElementById('sb-gr-total')!.textContent = String(grScore);
    document.getElementById('sb-bl-total')!.textContent = String(blScore);
    document.getElementById('sb-target-info')!.textContent = `目标 ${targetKills} 击杀 · 1:1 经典复刻`;

    const grBody = document.getElementById('sb-gr-rows')!;
    const blBody = document.getElementById('sb-bl-rows')!;

    const formatRows = (team: TeamId) =>
      entries
        .filter((e) => e.team === team)
        .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
        .map(
          (e, i) => `
          <tr class="${e.isSelf ? 'sb-row-self' : ''}">
            <td>${i === 0 && e.kills > 0 ? '★ ' : ''}${e.name}</td>
            <td>${e.weaponName}</td>
            <td>${e.kills}</td>
            <td>${e.deaths}</td>
            <td>${e.headshots}</td>
            <td>${e.ping}ms</td>
          </tr>
        `
        )
        .join('');

    grBody.innerHTML = formatRows('GR');
    blBody.innerHTML = formatRows('BL');
  }
}

export function getBagLabel(bagIdx: number): string {
  return LOADOUT_BAGS[bagIdx]?.name ?? '背包1';
}
