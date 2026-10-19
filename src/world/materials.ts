import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

export function createMaterials(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  onWarning: (message: string) => void,
) {
  const textures: THREE.Texture[] = [],
    loader = new THREE.TextureLoader(),
    pending: Promise<unknown>[] = [];
  const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  function load(name: string, color = false) {
    let done: () => void = () => {};
    pending.push(
      new Promise<void>((resolve) => {
        done = resolve;
      }),
    );
    const texture = loader.load(
      `${import.meta.env.BASE_URL}textures/${name}.webp`,
      () => done(),
      undefined,
      () => {
        onWarning(`材質 ${name} 載入失敗`);
        done();
      },
    );
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = maxAnisotropy;
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    return texture;
  }
  function pbr(prefix: string, color: string, roughness: number) {
    return new THREE.MeshStandardMaterial({
      name: prefix,
      color,
      map: load(`${prefix}-color`, true),
      normalMap: load(`${prefix}-normal`),
      roughnessMap: load(`${prefix}-roughness`),
      aoMap: load(`${prefix}-ao`),
      roughness,
      normalScale: new THREE.Vector2(0.7, 0.7),
      aoMapIntensity: 0.65,
    });
  }
  const sand = pbr("sand", "#f2ece0", 0.94);
  sand.normalScale.set(0.35, 0.35);
  const bark = pbr("bark", "#a89677", 0.96);
  bark.normalScale.set(0.9, 0.9);
  const reef = pbr("reef", "#f0e5cf", 0.82);
  reef.normalScale.set(0.5, 0.5);
  const rock = reef.clone();
  rock.color.set("#8b9b82");
  rock.roughness = 0.9;
  const leaf = new THREE.MeshPhysicalMaterial({
    name: "Leaf",
    color: "#4f7931",
    roughness: 0.48,
    side: THREE.DoubleSide,
    sheen: 0.5,
    sheenColor: new THREE.Color("#b7cd76"),
    sheenRoughness: 0.6,
  });
  const leafTime = { value: 0 };
  leaf.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = leafTime;
    shader.vertexShader =
      "uniform float uTime; varying vec3 vLeafLocal;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvLeafLocal=position; transformed.x+=sin(uTime*1.3+position.z*.8+position.x*.5)*.035*max(0.,position.y-5.);",
      );
    shader.fragmentShader =
      "varying vec3 vLeafLocal;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      float vein=.5+.5*sin(vLeafLocal.x*110.+vLeafLocal.z*95.);
      diffuseColor.rgb*=.88+.18*vein;
      #ifdef DOUBLE_SIDED
      if(!gl_FrontFacing)diffuseColor.rgb*=vec3(1.25,1.24,.85);
      #endif`,
      );
  };
  leaf.customProgramCacheKey = () => "botanical-leaf-v2";
  let environment: THREE.WebGLRenderTarget | undefined;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const environmentReady = new HDRLoader()
    .loadAsync(`${import.meta.env.BASE_URL}textures/environment.hdr`)
    .then((hdr) => {
      environment = pmrem.fromEquirectangular(hdr);
      scene.environment = environment.texture;
      scene.environmentIntensity = 0.55;
      hdr.dispose();
      pmrem.dispose();
    })
    .catch(() => {
      pmrem.dispose();
      onWarning("環境光資產未能載入，使用即時天空照明。");
    });
  return {
    sand,
    bark,
    rock,
    reef,
    leaf,
    ready: Promise.all([environmentReady, ...pending]),
    update(time: number, sub: number) {
      leafTime.value = time;
      scene.environmentIntensity = THREE.MathUtils.lerp(0.55, 0.45, sub);
    },
    dispose() {
      environment?.dispose();
      textures.forEach((t) => t.dispose());
    },
  };
}
export type WorldMaterials = ReturnType<typeof createMaterials>;

export function addSurfaceDetail(
  material: THREE.MeshStandardMaterial,
  scale: number,
  strength = 0.15,
) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying vec3 vOrganic;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvOrganic=position;",
      );
    shader.fragmentShader =
      `varying vec3 vOrganic;\n` +
      shader.fragmentShader
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
      float cell=sin(vOrganic.x*${scale.toFixed(1)}+sin(vOrganic.z*${(scale * 0.7).toFixed(1)}))*cos(vOrganic.y*${(scale * 0.85).toFixed(1)}+vOrganic.z*${scale.toFixed(1)});
      vec3 bump=vec3(dFdx(cell),dFdy(cell),0.);
      normal=normalize(normal+vec3(bump.xy,0.)*${strength.toFixed(3)});
    `,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
      float pigment=.5+.5*sin(vOrganic.x*${(scale * 0.45).toFixed(1)}+sin(vOrganic.z*${(scale * 0.5).toFixed(1)}))*cos(vOrganic.y*${(scale * 0.7).toFixed(1)});
      diffuseColor.rgb*=.72+.4*smoothstep(.15,.8,pigment);
    `,
        );
  };
  material.customProgramCacheKey = () => `organic-${scale}-${strength}`;
}
