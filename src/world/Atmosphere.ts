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

  private readonly scene: THREE.Scene;
  private readonly stars: THREE.Points;
  private readonly starMaterial: THREE.ShaderMaterial;
  private readonly clouds: THREE.InstancedMesh;
  private readonly sunMesh: THREE.Mesh;
  private readonly skyDome: THREE.Mesh;
  private readonly skyMaterial: THREE.ShaderMaterial;
  private readonly shootingStars: THREE.LineSegments;
  private readonly shootingStarMaterial: THREE.LineBasicMaterial;
  private readonly celestialGroup = new THREE.Group();
  private readonly celestialMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly dayColor = new THREE.Color(COLORS.skyDay);
  private readonly sunsetColor = new THREE.Color(COLORS.skySunset);
  private readonly nightColor = new THREE.Color(COLORS.skyNight);
  private readonly workingColor = new THREE.Color();
  private readonly cycleSeconds = 180;

  constructor(scene: THREE.Scene, seed = 991) {
    this.scene = scene;
    this.group.name = "living-sky";
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
      new THREE.SphereGeometry(0.7, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff0a6 }),
    );
    this.skyMaterial = this.createSkyMaterial();
    this.skyDome = this.buildSkyDome();
    this.starMaterial = this.createStarMaterial();
    this.stars = this.buildStars(seed);
    this.clouds = this.buildClouds(seed + 1);
    this.shootingStarMaterial = new THREE.LineBasicMaterial({
      color: 0xc6e9ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.shootingStars = this.buildShootingStars(seed + 2);
    this.buildCelestialBodies();
    this.group.add(
      this.skyDome,
      this.sunLight,
      this.sunLight.target,
      this.ambientLight,
      this.sunMesh,
      this.stars,
      this.shootingStars,
      this.celestialGroup,
      this.clouds,
      this.buildGlowShell(),
    );

    this.scene.fog = new THREE.FogExp2(COLORS.skyDay, 0.015);
    this.scene.background = this.dayColor.clone();
  }

  private createSkyMaterial() {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x60c8f2) },
        horizonColor: { value: new THREE.Color(0xd8f4ef) },
        bottomColor: { value: new THREE.Color(0x8cd8ef) },
        glow: { value: 0.4 },
      },
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        uniform float glow;
        varying vec3 vDirection;
        void main() {
          float y = vDirection.y;
          float upper = smoothstep(-0.05, 0.72, y);
          float lower = smoothstep(-0.8, -0.02, y);
          vec3 color = mix(bottomColor, horizonColor, lower);
          color = mix(color, topColor, upper);
          float horizon = pow(1.0 - abs(y), 6.0) * glow;
          color += vec3(1.0, 0.52, 0.24) * horizon * 0.22;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
  }

  private buildSkyDome() {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(65, 48, 32),
      this.skyMaterial,
    );
    mesh.renderOrder = -100;
    return mesh;
  }

  private buildGlowShell() {
    return new THREE.Mesh(
      new THREE.SphereGeometry(PLANET_RADIUS * 1.18, 64, 40),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { glowColor: { value: new THREE.Color(0x79ddff) } },
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

  private createStarMaterial() {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      uniforms: {
        time: { value: 0 },
        opacity: { value: 0 },
      },
      vertexShader: `
        attribute float phase;
        varying vec3 vColor;
        varying float vTwinkle;
        uniform float time;
        void main() {
          vColor = color;
          vTwinkle = 0.55 + 0.45 * sin(time * 2.4 + phase);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (2.0 + vTwinkle * 2.2) * (120.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vTwinkle;
        uniform float opacity;
        void main() {
          vec2 centered = gl_PointCoord - vec2(0.5);
          float distanceToCenter = length(centered);
          if (distanceToCenter > 0.5) discard;
          float glow = smoothstep(0.5, 0.0, distanceToCenter);
          gl_FragColor = vec4(vColor, glow * vTwinkle * opacity);
        }
      `,
    });
  }

  private buildStars(seed: number) {
    const random = new SeededRandom(seed);
    const positions: number[] = [];
    const colors: number[] = [];
    const phases: number[] = [];
    const color = new THREE.Color();
    for (let index = 0; index < 1800; index += 1) {
      const radius = random.range(31, 52);
      const y = random.range(-1, 1);
      const theta = random.range(0, Math.PI * 2);
      const radial = Math.sqrt(1 - y * y);
      positions.push(
        Math.cos(theta) * radial * radius,
        y * radius,
        Math.sin(theta) * radial * radius,
      );
      color.setHSL(random.range(0.06, 0.64), 0.35, random.range(0.72, 1));
      colors.push(color.r, color.g, color.b);
      phases.push(random.range(0, Math.PI * 2));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("phase", new THREE.Float32BufferAttribute(phases, 1));
    return new THREE.Points(geometry, this.starMaterial);
  }

  private buildClouds(seed: number) {
    const random = new SeededRandom(seed);
    const count = 92;
    const clouds = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.18, 1),
      new THREE.MeshBasicMaterial({
        color: 0xfff8e7,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      }),
      count,
    );
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let index = 0; index < count; index += 1) {
      const y = random.range(-0.84, 0.84);
      const theta = random.range(0, Math.PI * 2);
      const radial = Math.sqrt(1 - y * y);
      const radius = random.range(6.7, 7.25);
      position.set(
        Math.cos(theta) * radial * radius,
        y * radius,
        Math.sin(theta) * radial * radius,
      );
      quaternion.setFromUnitVectors(up, position.clone().normalize());
      scale.set(
        random.range(1.2, 2.9),
        random.range(0.48, 0.84),
        random.range(0.9, 1.8),
      );
      matrix.compose(position, quaternion, scale);
      clouds.setMatrixAt(index, matrix);
    }
    clouds.instanceMatrix.needsUpdate = true;
    return clouds;
  }

  private buildShootingStars(seed: number) {
    const random = new SeededRandom(seed);
    const points: number[] = [];
    for (let index = 0; index < 12; index += 1) {
      const start = new THREE.Vector3(
        random.range(-28, 28),
        random.range(8, 28),
        random.range(-28, 28),
      ).normalize().multiplyScalar(random.range(34, 46));
      const direction = new THREE.Vector3(
        random.range(-1, 1),
        random.range(-0.35, 0.35),
        random.range(-1, 1),
      ).normalize();
      const end = start.clone().addScaledVector(direction, random.range(1.1, 2.6));
      points.push(start.x, start.y, start.z, end.x, end.y, end.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return new THREE.LineSegments(geometry, this.shootingStarMaterial);
  }

  private buildCelestialBodies() {
    const moonMaterial = new THREE.MeshBasicMaterial({
      color: 0xe6efff,
      transparent: true,
      opacity: 0,
    });
    const moon = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.15, 3),
      moonMaterial,
    );
    moon.position.set(-18, 13, -23);
    this.celestialMaterials.push(moonMaterial);

    const planetMaterial = new THREE.MeshBasicMaterial({
      color: 0xb98be9,
      transparent: true,
      opacity: 0,
    });
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xf6c86d,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 24, 16),
      planetMaterial,
    );
    const rings = new THREE.Mesh(
      new THREE.RingGeometry(1.05, 1.42, 36),
      ringMaterial,
    );
    rings.rotation.x = 1.25;
    planet.add(rings);
    planet.position.set(24, -3, -27);
    this.celestialMaterials.push(planetMaterial, ringMaterial);
    this.celestialGroup.add(moon, planet);
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
      this.scene.fog.density = 0.01 + (1 - daylight) * 0.007;
    }

    const top = this.skyMaterial.uniforms.topColor.value as THREE.Color;
    const horizon = this.skyMaterial.uniforms.horizonColor.value as THREE.Color;
    const bottom = this.skyMaterial.uniforms.bottomColor.value as THREE.Color;
    top.set(0x13183b).lerp(new THREE.Color(0x54bce9), daylight);
    horizon
      .set(0x443965)
      .lerp(new THREE.Color(0xcff0ed), daylight)
      .lerp(new THREE.Color(0xffad74), sunsetAmount * 0.72);
    bottom.set(0x171a39).lerp(new THREE.Color(0x7fd2e8), daylight);
    this.skyMaterial.uniforms.glow.value = 0.25 + sunsetAmount * 1.4;

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

    this.starMaterial.uniforms.time.value = elapsed;
    this.starMaterial.uniforms.opacity.value = THREE.MathUtils.clamp(
      (0.55 - daylight) * 2.15,
      0,
      1,
    );
    const nightVisibility = THREE.MathUtils.clamp((0.5 - daylight) * 2.2, 0, 0.9);
    this.celestialMaterials.forEach((material) => {
      material.opacity = nightVisibility;
    });
    this.shootingStarMaterial.opacity =
      nightVisibility * Math.max(0, Math.sin(elapsed * 0.34)) * 0.78;
    const cloudMaterial = this.clouds.material as THREE.MeshBasicMaterial;
    cloudMaterial.opacity = 0.28 + daylight * 0.52;
    this.clouds.rotation.y = elapsed * 0.003;
    this.stars.rotation.y = elapsed * 0.0015;
    this.shootingStars.rotation.y = elapsed * 0.006;
    this.celestialGroup.rotation.y = elapsed * 0.001;

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
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.LineSegments)) {
        return;
      }
      object.geometry.dispose();
      const material = object.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    });
  }
}
