/**
 * Minimal change-notification base for mutable engine objects. The React layer subscribes via
 * `useSyncExternalStore` and re-renders whenever {@link Observable.version} changes.
 */
export abstract class Observable {
  private listeners = new Set<() => void>();
  private _version = 0;

  get version(): number {
    return this._version;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  protected notify(): void {
    this._version += 1;
    for (const listener of [...this.listeners]) listener();
  }
}
