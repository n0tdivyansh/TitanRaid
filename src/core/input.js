/**
 * Unified input: keyboard (A/D + arrows), mouse drag, touch swipe.
 *
 * Exposes a normalised lateral target in [-1, 1] plus a raw axis for keys.
 * Pointer control is *relative*: dragging moves the crowd by the drag delta,
 * matching the feel of the original ("swipe or drag left/right to move").
 */
export class Input {
  constructor(element) {
    this.el = element;
    this.axis = 0; // -1 .. 1 from keyboard
    this.pointerDelta = 0; // normalised (-1..1) accumulated pointer movement this frame
    this.dragging = false;
    this.hasMoved = false; // used to dismiss the tutorial
    this.enabled = true;

    this._keys = new Set();
    this._lastX = 0;
    this._activePointer = null;

    this._onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (['a', 'd', 'arrowleft', 'arrowright'].includes(k)) {
        this._keys.add(k);
        this.hasMoved = true;
        e.preventDefault();
      }
      this._updateAxis();
    };
    this._onKeyUp = (e) => {
      this._keys.delete(e.key.toLowerCase());
      this._updateAxis();
    };
    this._onBlur = () => {
      this._keys.clear();
      this.axis = 0;
      this.dragging = false;
      this._activePointer = null;
    };

    this._onPointerDown = (e) => {
      if (!this.enabled) return;
      if (this._activePointer !== null) return;
      this._activePointer = e.pointerId;
      this.dragging = true;
      this._lastX = e.clientX;
      if (this.el.setPointerCapture) {
        try {
          this.el.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
    };
    this._onPointerMove = (e) => {
      if (!this.dragging || e.pointerId !== this._activePointer) return;
      const dx = e.clientX - this._lastX;
      this._lastX = e.clientX;
      // A full drag across ~40% of the viewport width spans the whole road.
      this.pointerDelta += dx / (window.innerWidth * 0.4);
      if (Math.abs(dx) > 1) this.hasMoved = true;
    };
    this._onPointerUp = (e) => {
      if (e.pointerId !== this._activePointer) return;
      this.dragging = false;
      this._activePointer = null;
    };

    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    this.el.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove, { passive: true });
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
  }

  _updateAxis() {
    const left = this._keys.has('a') || this._keys.has('arrowleft');
    const right = this._keys.has('d') || this._keys.has('arrowright');
    this.axis = (right ? 1 : 0) - (left ? 1 : 0);
  }

  /** Consume the pointer delta accumulated since the previous frame. */
  consumePointerDelta() {
    const d = this.pointerDelta;
    this.pointerDelta = 0;
    return d;
  }

  reset() {
    this.pointerDelta = 0;
    this.hasMoved = false;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.el.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
  }
}
