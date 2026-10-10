// The real seabed: a grid mesh displaced by the measured heightmap, draped with the matching
// imagery (same grid, so it lines up by construction). The shader adds moving caustics and, where
// a satellite cannot see the bottom (deep water), fades the photo towards a generated sand colour.
import { useEffect, useMemo } from 'react';
import { useLoader, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Terrain } from './terrain';

export interface CausticUniforms {
  uTime: { value: number };
}

/** Adds world-space caustics (and a deep-water fade) to a standard material. */
export function withCaustics(material: THREE.MeshStandardMaterial, opts: { scale: number; surface: number; fadeBelow?: number; base?: string; detail?: boolean }) {
  const uniforms: CausticUniforms & Record<string, { value: unknown }> = {
    uTime: { value: 0 },
    uCausticScale: { value: opts.scale },
    uSurface: { value: opts.surface },
    uFadeBelow: { value: opts.fadeBelow ?? -1e6 },
    uBase: { value: new THREE.Color(opts.base ?? '#d9c79c') },
    uDetail: { value: opts.detail ? 1 : 0 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vWorldPos;
         uniform float uTime; uniform float uCausticScale; uniform float uSurface; uniform float uFadeBelow; uniform vec3 uBase; uniform float uDetail;
         float dhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
         float dnoise(vec2 p) {
           vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
           return mix(mix(dhash(i), dhash(i + vec2(1, 0)), u.x), mix(dhash(i + vec2(0, 1)), dhash(i + vec2(1, 1)), u.x), u.y);
         }
         float dfbm(vec2 p) { return dnoise(p) * 0.5 + dnoise(p * 2.3) * 0.3 + dnoise(p * 5.1) * 0.2; }
         float cfield(vec2 p, float t) {
           return sin(p.x * 1.7 + t * 0.9 + sin(p.y * 1.3 + t * 0.7)) + sin(p.y * 2.1 - t * 0.8 + sin(p.x * 1.1 - t * 0.5)) + sin((p.x + p.y) * 1.3 + t * 0.6);
         }
         float caustic(vec2 p, float t) {
           float a = abs(cfield(p, t));
           float b = abs(cfield(p * 1.37 + 3.1, t * 1.21));
           return pow(max(0.0, 1.0 - a * 0.55), 6.0) + pow(max(0.0, 1.0 - b * 0.6), 7.0) * 0.7;
         }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         // Deep water: the satellite saw no bottom here, so blend to a generated sand colour.
         float deep = smoothstep(uFadeBelow, uFadeBelow - 6.0, vWorldPos.y);
         diffuseColor.rgb = mix(diffuseColor.rgb, uBase * (0.8 + 0.2 * caustic(vWorldPos.xz * 0.7, 0.0)), deep);
         // Generated fine texture (coarse imagery only): grain, patches of rubble and darker growth.
         if (uDetail > 0.5) {
           float grain = dfbm(vWorldPos.xz * 1.7);
           float patches = smoothstep(0.45, 0.7, dfbm(vWorldPos.xz * 0.12 + 7.0));
           vec3 growth = vec3(0.42, 0.36, 0.28);
           diffuseColor.rgb *= 0.78 + 0.44 * grain;
           diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * growth * 1.6, patches * 0.55);
         }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float depthBelow = max(0.0, uSurface - vWorldPos.y);
         float strength = 0.28 * exp(-depthBelow * 0.06);
         totalEmissiveRadiance += vec3(0.7, 0.95, 1.0) * caustic(vWorldPos.xz / uCausticScale * 3.0, uTime) * strength * diffuseColor.rgb * 2.2;`,
      );
  };
  material.customProgramCacheKey = () => `caustics-${opts.scale}-${opts.fadeBelow ?? 'none'}-${opts.detail ? 1 : 0}`;
  return uniforms;
}

/** A displaced grid for a terrain, row 0 = north (-z). */
export function terrainGeometry(t: Terrain) {
  const g = new THREE.PlaneGeometry(t.sizeX, t.sizeZ, t.width - 1, t.depth - 1);
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, t.heights[i]!);
  pos.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

export function TerrainMesh({ terrain, textureUrl, causticScale, surface, fadeBelow, detail = false, onPointer, onClick }: {
  terrain: Terrain;
  textureUrl: string | null;
  causticScale: number;
  surface: number;
  fadeBelow?: number;
  /** Add generated fine texture (for coarse imagery). */
  detail?: boolean;
  onPointer?: (p: THREE.Vector3 | null) => void;
  onClick?: (p: THREE.Vector3, delta: number) => void;
}) {
  const geometry = useMemo(() => terrainGeometry(terrain), [terrain]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const map = useLoader(THREE.TextureLoader, textureUrl ?? '/favicon.svg');
  const material = useMemo(() => {
    if (textureUrl) {
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 8;
    }
    const m = new THREE.MeshStandardMaterial({ map: textureUrl ? map : null, color: textureUrl ? '#ffffff' : '#d9c79c', roughness: 0.92, metalness: 0 });
    return m;
  }, [map, textureUrl]);
  const uniforms = useMemo(() => withCaustics(material, { scale: causticScale, surface, fadeBelow, detail }), [material, causticScale, surface, fadeBelow, detail]);
  useFrame((_, dt) => void (uniforms.uTime.value += dt));
  return (
    <mesh
      geometry={geometry}
      material={material}
      receiveShadow
      onPointerMove={(e) => onPointer?.(e.point.clone())}
      onPointerOut={() => onPointer?.(null)}
      onClick={(e) => onClick?.(e.point.clone(), e.delta)}
    />
  );
}
