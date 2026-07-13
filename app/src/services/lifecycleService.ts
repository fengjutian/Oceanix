/**
 * LifecycleService — VSCode LifecyclePhase pattern.
 *
 * Tracks startup progress through defined phases. Services can
 * wait for a phase before initializing, avoiding race conditions
 * from scattered useEffect hooks.
 *
 * Usage:
 *   lifecycle.onPhase("ready", () => { loadExtensions(); });
 *   lifecycle.phase = "restored"; // Advance to next phase
 */

type LifecyclePhase = "starting" | "ready" | "restored" | "shutdown";
type PhaseCallback = () => void;

class LifecycleService {
  private _phase: LifecyclePhase = "starting";
  private listeners = new Map<LifecyclePhase, Set<PhaseCallback>>();
  /** Callbacks already fired are stored so late subscribers run immediately */
  private fired = new Set<LifecyclePhase>();

  get phase(): LifecyclePhase {
    return this._phase;
  }

  set phase(next: LifecyclePhase) {
    if (this._phase === next) return;
    this._phase = next;
    this.fired.add(next);
    const cbs = this.listeners.get(next);
    if (cbs) {
      for (const cb of cbs) cb();
    }
  }

  /** Register a callback for a specific phase. Runs immediately if phase already fired. */
  onPhase(phase: LifecyclePhase, cb: PhaseCallback): () => void {
    if (this.fired.has(phase)) {
      cb();
      return () => {};
    }
    if (!this.listeners.has(phase)) {
      this.listeners.set(phase, new Set());
    }
    this.listeners.get(phase)!.add(cb);
    return () => this.listeners.get(phase)?.delete(cb);
  }

  /** Wait for a phase (Promise-based). */
  whenPhase(phase: LifecyclePhase): Promise<void> {
    if (this.fired.has(phase)) return Promise.resolve();
    return new Promise((resolve) => {
      this.onPhase(phase, resolve);
    });
  }
}

export const lifecycle = new LifecycleService();
export type { LifecyclePhase };
