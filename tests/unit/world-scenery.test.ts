import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { Planet } from "../../src/world/Planet";

let planet: Planet | null = null;

afterEach(() => {
  planet?.dispose();
  planet = null;
});

describe("polished planet scenery", () => {
  it("grounds tree trunk bases on the rendered terrain mesh", () => {
    planet = new Planet(7319);
    const trunks = planet.group.getObjectByName(
      "grounded-tree-trunks",
    ) as THREE.InstancedMesh;
    expect(trunks.count).toBeGreaterThan(1000);

    const matrix = new THREE.Matrix4();
    const bottom = new THREE.Vector3(0, -0.07, 0);
    for (let index = 0; index < 40; index += 1) {
      trunks.getMatrixAt(index, matrix);
      const worldBottom = bottom.clone().applyMatrix4(matrix);
      const normal = worldBottom.clone().normalize();
      expect(worldBottom.length()).toBeCloseTo(
        planet.terrainSurfaceRadiusAt(normal),
        3,
      );
    }
  });

  it("builds a full set of grounded and water landmarks", () => {
    planet = new Planet(7319);
    const names: string[] = [];
    planet.scenery.group.traverse((object) => {
      if (object.name) names.push(object.name);
    });

    expect(names.filter((name) => name.startsWith("lighthouse-"))).toHaveLength(
      4,
    );
    expect(names.filter((name) => name.startsWith("city-district-"))).toHaveLength(
      3,
    );
    expect(
      names.filter(
        (name) =>
          name.startsWith("sailboat-") || name.startsWith("workboat-"),
      ),
    ).toHaveLength(8);
    expect(names.filter((name) => name.startsWith("navigation-buoy-"))).toHaveLength(
      16,
    );
    expect(planet.group.getObjectByName("mountain-peaks")).toBeTruthy();
  });
});
