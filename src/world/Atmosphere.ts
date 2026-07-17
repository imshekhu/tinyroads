import * as THREE from "three";
import { COLORS, PLANET_RADIUS } from "../config";
import { SeededRandom } from "./Noise";

export type SkyState = {
  phase: "day" | "sunset" | "night";
  daylight: number;
  cycleProgress: number;
};

export class Atmosphere {
  readonly group = new THREE.Group();
  readonly sunLight: THREE.DirectionalLight;
  readonly ambientLight: THREE.HemisphereLight;

  private readonly stars: THREE.Points;
  private readonly clouds: THREE.InstancedMesh;
  private readonly sunMesh: THREE.Mesh;
  private readonly dayColor = new THREE.Color(COLORS.skyDay);
  private readonly sunsetColor = new THREE.Color(COLORS.skySunset);
  private readonly nightColor = new THREE.Color(COLORS.skyNight);
  private readonly workingColor = new THREE.Color();
  private readonly cycleSeconds = 180;
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene, seed = 991) {
    this.scene = scene;
    this.group.name = "atmosphere";
    this.sunLight = new THREE.DirectionalLight(0xfff1c4, 3.2);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 35;
    this.sunLight.shadow.camera.left = -9;
    this.sunLight.shadow.camera.right = 9;
    this.sunLight.shadow.camera.top = 9;
    this.sunLight.shadow.camera.bottom = -9;
    this.sunLight.shadow.bias = -0.0004;

    this.ambientLight = new THREE.HemisphereLight(0xbce8ff, 0x3e4b35, 1.75);
    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 20, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff0a6 }),
    );
    this.stars = this.buildStars(seed);
    this.clouds = this.buildClouds(seed + 1);
    this.group.add(
      this.sunLight,
      this.sunLight.target,
      this.ambientLight,
      this.sunMesh,
      this.stars,
      this.clouds,
      this.buildGlowShell(),
    );

    this.scene.fog = new THREE.FogExp2(COLORS.skyDay, 0.015);
    this.scene.background = this.dayColor.clone();
  }

  private buildGlowShell() {
    return new THREE.Mesh(
      new THREE.SphereGeometry(PLANET_RADIUS * 1.18, 64, 40),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          glowColor: { value: new THREE.Color(0x79ddff) },
        },
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 glowColor;
          varying vec3 vNormal;
          void main() {
            float edge = pow(1.0 - abs(vNormal.z), 2.1);
            gl_FragColor = vec4(glowColor, edge * 0.24);
          }
        `,
      }),
    );
  }

  private buildStars(seed: number) {
    const random = new SeededRandom(seed);
    const positions: number[] = [];
    const colors: number[] = [];
    const color = new THREE.Color();
    for (let index = 0; index < 850; index += 1) {
      const radius = random.range(28, 46);
      const y = random.range(-1, 1);
      const theta = random.range(0, Math.PI * 2);
      const radial = Math.sqrt(1 - y * y);
      positions.push(
        Math.cos(theta) * radial * radius,
        y * radius,
        Math.sin(theta) * radial * radius,
      );
      color.setHSL(random.range(0.08, 0.62), 0.28, random.range(0.72, 1));
      colors.push(color.r, color.g, color.b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colors, 3),
    );
    const material = new THREE.PointsMaterial({
      size: 0.055,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      sizeAttenuation: true,
      depthWrite: false,
    });
    return new THREE.Points(geometry, material);
  }

  private buildClouds(seed: number) {
    const random = new SeededRandom(seed);
    const count = 74;
    const clouds = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.18, 1),
      new THREE.MeshPhongMaterial({
        color: 0xfff8e7,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        flatShading: true,
      }),
      count,
    );
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    for (let index = 0; index < count; index += 1) {
      const y = random.range(-0.84, 0.84);
      const theta = random.range(0, Math.PI * 2);
      const radial = Math.sqrt(1 - y * y);
      const radius = random.range(6.65, 7.1);
      position.set(
        Math.cos(theta) * radial * radius,
        y * radius,
        Math.sin(theta) * radial * radius,
      );
      quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        position.clone().normalize(),
      );
      scale.set(
        random.range(0.8, 2.1),
        random.range(0.45, 0.82),
        random.range(0.7, 1.45),
      );
      matrix.compose(position, quaternion, scale);
      clouds.setMatrixAt(index, matrix);
    }
    clouds.instanceMatrix.needsUpdate = true;
    return clouds;
  }

  update(elapsed: number): SkyState {
    const cycleProgress = (elapsed % this.cycleSeconds) / this.cycleSeconds;
    const angle = cycleProgress * Math.PI * 2;
    const sunHeight = Math.sin(angle);
    const daylight = THREE.MathUtils.smoothstep(sunHeight, -0.25, 0.25);
    const sunsetAmount =
      (1 - Math.abs(THREE.MathUtils.clamp(sunHeight * 3, -1, 1))) *
      (0.35 + daylight * 0.65);

    this.workingColor.copy(this.nightColor).lerp(this.dayColor, daylight);
    this.workingColor.lerp(this.sunsetColor, sunsetAmount * 0.56);
    this.scene.background = this.workingColor;
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(this.workingColor);
      this.scene.fog.density = 0.011 + (1 - daylight) * 0.008;
    }

    const sunPosition = new THREE.Vector3(
      Math.cos(angle) * 15,
      Math.sin(angle) * 15,
      Math.sin(angle * 0.43) * 5,
    );
    this.sunLight.position.copy(sunPosition);
    this.sunMesh.position.copy(sunPosition.clone().normalize().multiplyScalar(22));
    this.sunLight.intensity = 0.18 + daylight * 3.1;
    this.ambientLight.intensity = 0.42 + daylight * 1.35;
    this.ambientLight.color
      .set(0x8ca8d5)
      .lerp(new THREE.Color(0xc9efff), daylight);
    this.ambientLight.groundColor
      .set(0x20234a)
      .lerp(new THREE.Color(0x59694b), daylight);

    const starMaterial = this.stars.material as THREE.PointsMaterial;
    starMaterial.opacity = THREE.MathUtils.clamp((0.45 - daylight) * 2.1, 0, 0.9);
    const cloudMaterial = this.clouds.material as THREE.MeshPhongMaterial;
    cloudMaterial.opacity = 0.28 + daylight * 0.52;
    this.clouds.rotation.y = elapsed * 0.003;
    this.stars.rotation.y = elapsed * 0.0015;

    return {
      phase:
        daylight < 0.28
          ? "night"
          : sunsetAmount > 0.48
            ? "sunset"
            : "day",
      daylight,
      cycleProgress,
    };
  }

  dispose() {
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
      object.geometry.dispose();
      const material = object.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    });
  }
}
