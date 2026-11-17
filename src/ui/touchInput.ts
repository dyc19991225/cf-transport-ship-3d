export class TouchInputManager {
  public readonly isTouchDevice: boolean;
  public moveX = 0; // -1..1
  public moveZ = 0; // -1..1 (forward negative or positive handled by caller)
  public firing = false;

  private lookDeltaX = 0;
  private lookDeltaY = 0;
  private moveTouchId: number | null = null;
  private lookTouchId: number | null = null;
  private moveOriginX = 0;
  private moveOriginY = 0;
  private lastLookX = 0;
  private lastLookY = 0;

  constructor(callbacks: {
    onAim: () => void;
    onJump: () => void;
    onToggleCrouch: () => void;
    onReload: () => void;
    onQuickSwitch: () => void;
    onQuickGrenade: () => void;
  }) {
    this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!this.isTouchDevice) return;

    const moveZone = document.getElementById('touch-move-zone')!;
    const knob = document.getElementById('touch-move-knob')!;
    const lookZone = document.getElementById('touch-look-zone')!;

    moveZone.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        this.moveTouchId = t.identifier;
        this.moveOriginX = t.clientX;
        this.moveOriginY = t.clientY;
      },
      { passive: false }
    );

    moveZone.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === this.moveTouchId) {
            const dx = t.clientX - this.moveOriginX;
            const dy = t.clientY - this.moveOriginY;
            const maxR = 44;
            const dist = Math.hypot(dx, dy);
            const clamped = Math.min(maxR, dist);
            const ang = Math.atan2(dy, dx);
            const kx = Math.cos(ang) * clamped;
            const ky = Math.sin(ang) * clamped;
            knob.style.transform = `translate(${kx}px, ${ky}px)`;
            this.moveX = kx / maxR;
            this.moveZ = ky / maxR;
          }
        }
      },
      { passive: false }
    );

    const resetStick = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.moveTouchId) {
          this.moveTouchId = null;
          this.moveX = 0;
          this.moveZ = 0;
          knob.style.transform = 'translate(0px, 0px)';
        }
      }
    };
    moveZone.addEventListener('touchend', resetStick);
    moveZone.addEventListener('touchcancel', resetStick);

    lookZone.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        this.lookTouchId = t.identifier;
        this.lastLookX = t.clientX;
        this.lastLookY = t.clientY;
      },
      { passive: false }
    );

    lookZone.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === this.lookTouchId) {
            this.lookDeltaX += (t.clientX - this.lastLookX) * 2.1;
            this.lookDeltaY += (t.clientY - this.lastLookY) * 2.1;
            this.lastLookX = t.clientX;
            this.lastLookY = t.clientY;
          }
        }
      },
      { passive: false }
    );

    const endLook = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.lookTouchId) {
          this.lookTouchId = null;
        }
      }
    };
    lookZone.addEventListener('touchend', endLook);
    lookZone.addEventListener('touchcancel', endLook);

    const fireBtn = document.getElementById('t-btn-fire')!;
    fireBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.firing = true; });
    fireBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.firing = false; });
    fireBtn.addEventListener('touchcancel', () => { this.firing = false; });

    document.getElementById('t-btn-aim')!.addEventListener('touchstart', (e) => { e.preventDefault(); callbacks.onAim(); });
    document.getElementById('t-btn-jump')!.addEventListener('touchstart', (e) => { e.preventDefault(); callbacks.onJump(); });
    document.getElementById('t-btn-crouch')!.addEventListener('touchstart', (e) => { e.preventDefault(); callbacks.onToggleCrouch(); });
    document.getElementById('t-btn-reload')!.addEventListener('touchstart', (e) => { e.preventDefault(); callbacks.onReload(); });
    document.getElementById('t-btn-switch')!.addEventListener('touchstart', (e) => { e.preventDefault(); callbacks.onQuickSwitch(); });
    document.getElementById('t-btn-nade')!.addEventListener('touchstart', (e) => { e.preventDefault(); callbacks.onQuickGrenade(); });
  }

  public setVisible(vis: boolean): void {
    if (!this.isTouchDevice) return;
    document.getElementById('touch-controls')!.classList.toggle('hidden', !vis);
  }

  public consumeLookDelta(): { dx: number; dy: number } {
    const out = { dx: this.lookDeltaX, dy: this.lookDeltaY };
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    return out;
  }
}
