export type DriveInput = {
  throttle: number;
  brake: number;
  steering: number;
  handbrake: boolean;
  boost: boolean;
};

type Action = "left" | "right" | "throttle" | "brake" | "handbrake" | "boost";

export class Controls {
  private readonly pressed = new Set<Action>();
  private readonly cleanups: Array<() => void> = [];
  private enabled = false;

  constructor() {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!this.enabled || this.isEditableTarget(event.target)) return;
      const action = this.actionForKey(event.code);
      if (!action) return;
      this.pressed.add(action);
      event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const action = this.actionForKey(event.code);
      if (!action) return;
      this.pressed.delete(action);
      event.preventDefault();
    };
    const onBlur = () => this.pressed.clear();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    this.cleanups.push(
      () => window.removeEventListener("keydown", onKeyDown),
      () => window.removeEventListener("keyup", onKeyUp),
      () => window.removeEventListener("blur", onBlur),
    );

    document.querySelectorAll<HTMLElement>("[data-control]").forEach((element) => {
      const action = element.dataset.control as Action;
      const press = (event: PointerEvent) => {
        if (!this.enabled) return;
        event.preventDefault();
        element.setPointerCapture(event.pointerId);
        this.pressed.add(action);
        element.classList.add("is-pressed");
      };
      const release = (event: PointerEvent) => {
        event.preventDefault();
        this.pressed.delete(action);
        element.classList.remove("is-pressed");
      };
      element.addEventListener("pointerdown", press);
      element.addEventListener("pointerup", release);
      element.addEventListener("pointercancel", release);
      element.addEventListener("contextmenu", (event) => event.preventDefault());
      this.cleanups.push(() => {
        element.removeEventListener("pointerdown", press);
        element.removeEventListener("pointerup", release);
        element.removeEventListener("pointercancel", release);
      });
    });
  }

  private actionForKey(code: string): Action | null {
    switch (code) {
      case "KeyA":
      case "ArrowLeft":
        return "left";
      case "KeyD":
      case "ArrowRight":
        return "right";
      case "KeyW":
      case "ArrowUp":
        return "throttle";
      case "KeyS":
      case "ArrowDown":
        return "brake";
      case "Space":
        return "handbrake";
      case "ShiftLeft":
      case "ShiftRight":
        return "boost";
      default:
        return null;
    }
  }

  private isEditableTarget(target: EventTarget | null) {
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "BUTTON" ||
          target.tagName === "A"))
    );
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.pressed.clear();
  }

  getInput(): DriveInput {
    if (!this.enabled) {
      return {
        throttle: 0,
        brake: 0,
        steering: 0,
        handbrake: false,
        boost: false,
      };
    }
    const gamepad = navigator.getGamepads?.()[0];
    const gamepadSteering =
      gamepad && Math.abs(gamepad.axes[0] ?? 0) > 0.12
        ? gamepad.axes[0]
        : 0;
    const gamepadThrottle = gamepad ? gamepad.buttons[7]?.value ?? 0 : 0;
    const gamepadBrake = gamepad ? gamepad.buttons[6]?.value ?? 0 : 0;

    return {
      throttle: Math.max(
        this.pressed.has("throttle") ? 1 : 0,
        gamepadThrottle,
      ),
      brake: Math.max(this.pressed.has("brake") ? 1 : 0, gamepadBrake),
      steering:
        gamepadSteering ||
        (this.pressed.has("left") ? -1 : 0) +
          (this.pressed.has("right") ? 1 : 0),
      handbrake:
        this.pressed.has("handbrake") || Boolean(gamepad?.buttons[0]?.pressed),
      boost: this.pressed.has("boost") || Boolean(gamepad?.buttons[1]?.pressed),
    };
  }

  dispose() {
    for (const cleanup of this.cleanups) cleanup();
    this.pressed.clear();
  }
}
