// If the 3D scene crashes (or the GPU drops the WebGL context), show a way back instead of a
// blank screen. The build itself lives in the store, so reloading the scene loses nothing.
import { Component, type ReactNode } from 'react';

export class SceneBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[ReefForge] 3D scene crashed:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="glass-deep max-w-md p-6 text-center">
          <p className="font-display text-24 font-bold">The underwater view stopped</p>
          <p className="mt-2 text-15">Your design is safe. Reload the scene to keep building.</p>
          <p className="mt-2 text-13 text-white/80">{this.state.error.message}</p>
          <button className="btn mt-4" onClick={() => this.setState({ error: null })}>Reload the scene</button>
        </div>
      </div>
    );
  }
}
