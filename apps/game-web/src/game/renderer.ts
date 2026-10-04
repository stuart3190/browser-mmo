import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { Engine } from '@babylonjs/core/Engines/engine';

/**
 * Creates the rendering engine.
 *
 * Default: WebGL2 (verified path). WebGPU is opt-in with `?renderer=webgpu` and falls back to
 * WebGL2 when unsupported. Gameplay code only sees AbstractEngine, so switching the default to
 * WebGPU later requires no gameplay changes.
 */
export async function createEngine(
  canvas: HTMLCanvasElement,
): Promise<{ engine: AbstractEngine; kind: 'webgpu' | 'webgl2' }> {
  const wanted = new URLSearchParams(location.search).get('renderer');
  if (wanted === 'webgpu') {
    const { WebGPUEngine } = await import('@babylonjs/core/Engines/webgpuEngine');
    if (await WebGPUEngine.IsSupportedAsync) {
      const engine = new WebGPUEngine(canvas, { antialias: true });
      try {
        await engine.initAsync();
        return { engine, kind: 'webgpu' };
      } catch (error) {
        engine.dispose();
        console.warn('WebGPU initialization failed; falling back to WebGL2', error);
      }
    }
    console.warn('WebGPU not supported; falling back to WebGL2');
  }
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true }, true);
  return { engine, kind: 'webgl2' };
}
