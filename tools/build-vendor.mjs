// Rebuilds src/vendor/pixi.mjs (trimmed PixiJS v8, WebGL only) and src/vendor/gsap.mjs.
// Usage (outside the repo, needs network once):
//   mkdir /tmp/fwv && cd /tmp/fwv && npm i pixi.js@8 gsap@3 esbuild
//   node <repo>/tools/build-vendor.mjs /tmp/fwv <repo>/src/vendor
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
const [dir, outRel] = process.argv.slice(2);
const out = resolve(outRel);
const L = `${dir}/node_modules/pixi.js/lib`;
writeFileSync(`${dir}/pixi-entry.js`, `
import '${L}/rendering/init.mjs';
import '${L}/scene/graphics/init.mjs';
import '${L}/scene/mesh/init.mjs';
import '${L}/scene/particle-container/init.mjs';
import '${L}/scene/sprite-tiling/init.mjs';
import { extensions } from '${L}/extensions/Extensions.mjs';
import { browserExt } from '${L}/environment-browser/browserExt.mjs';
extensions.add(browserExt);
export { extensions };
export { WebGLRenderer } from '${L}/rendering/renderers/gl/WebGLRenderer.mjs';
export { Container } from '${L}/scene/container/Container.mjs';
export { Sprite } from '${L}/scene/sprite/Sprite.mjs';
export { Texture } from '${L}/rendering/renderers/shared/texture/Texture.mjs';
export { TextureSource } from '${L}/rendering/renderers/shared/texture/sources/TextureSource.mjs';
export { Graphics } from '${L}/scene/graphics/shared/Graphics.mjs';
export { Mesh } from '${L}/scene/mesh/shared/Mesh.mjs';
export { MeshGeometry } from '${L}/scene/mesh/shared/MeshGeometry.mjs';
export { MeshRope } from '${L}/scene/mesh-simple/MeshRope.mjs';
export { ParticleContainer } from '${L}/scene/particle-container/shared/ParticleContainer.mjs';
export { Particle } from '${L}/scene/particle-container/shared/Particle.mjs';
export { TilingSprite } from '${L}/scene/sprite-tiling/TilingSprite.mjs';
export { Rectangle } from '${L}/maths/shapes/Rectangle.mjs';
// V3.2 living backdrop: custom painted-layer shader (flow maps, ripples, wind)
export { Shader } from '${L}/rendering/renderers/shared/shader/Shader.mjs';
export { GlProgram } from '${L}/rendering/renderers/gl/shader/GlProgram.mjs';
export { UniformGroup } from '${L}/rendering/renderers/shared/shader/UniformGroup.mjs';
`);
// test-only WebGPU bundle (?renderer=webgpu), lazily loaded, never on first load
writeFileSync(`${dir}/gsap-entry.js`, `import { gsap } from 'gsap/gsap-core.js'; import { CSSPlugin } from 'gsap/CSSPlugin.js'; gsap.registerPlugin(CSSPlugin); export { gsap as default, gsap };`);
const eb = `${dir}/node_modules/.bin/esbuild`;
execSync(`${eb} ${dir}/pixi-entry.js --bundle --format=esm --minify --target=es2020 --legal-comments=inline --outfile=${out}/pixi.mjs`, { stdio: 'inherit', cwd: dir });
execSync(`${eb} ${dir}/gsap-entry.js --bundle --format=esm --minify --legal-comments=inline --outfile=${out}/gsap.mjs`, { stdio: 'inherit', cwd: dir });
const gpuEntry = `${dir}/pixi-entry-gpu.js`;
import { readFileSync } from 'node:fs';
writeFileSync(gpuEntry, readFileSync(`${dir}/pixi-entry.js`, 'utf8').replace('export { WebGLRenderer }', `export { WebGPURenderer } from '${L}/rendering/renderers/gpu/WebGPURenderer.mjs';\nexport { WebGLRenderer }`));
execSync(`${eb} ${gpuEntry} --bundle --format=esm --minify --target=es2020 --legal-comments=inline --outfile=${out}/pixi-webgpu.mjs`, { stdio: 'inherit', cwd: dir });
