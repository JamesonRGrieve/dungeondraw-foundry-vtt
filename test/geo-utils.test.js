import { describe, it, expect } from "vitest";
import * as geo from "../src/geo-utils.js";

const makeRect = (x, y, w, h) =>
  geo.rectToPolygon({ x, y, width: w, height: h });

describe("expandGeometry (brush buffer)", () => {
  it("buffers a line into a polygon with area", () => {
    const line = geo.twoPointsToLineString(0, 0, 100, 0);
    const buffered = geo.expandGeometry(line, 10);
    expect(buffered).not.toBeNull();
    expect(buffered.getArea()).toBeGreaterThan(0);
  });

  it("buffer result is valid geometry", () => {
    const line = geo.twoPointsToLineString(10, 10, 90, 10);
    const buffered = geo.expandGeometry(line, 20);
    expect(geo.isValid(buffered)).toBe(true);
  });

  it("buffers a multi-segment path into valid geometry", () => {
    const coords = [
      new geo.Coordinate(0, 0),
      new geo.Coordinate(50, 50),
      new geo.Coordinate(100, 0),
    ];
    const line = new geo.GeometryFactory().createLineString(coords);
    const buffered = geo.expandGeometry(line, 15);
    expect(buffered.getArea()).toBeGreaterThan(0);
    expect(geo.isValid(buffered)).toBe(true);
  });

  it("buffer area scales with radius", () => {
    const line = geo.twoPointsToLineString(0, 0, 100, 0);
    const small = geo.expandGeometry(line, 5);
    const large = geo.expandGeometry(line, 20);
    expect(large.getArea()).toBeGreaterThan(small.getArea());
  });
});

describe("surface clipping operations", () => {
  it("intersection clips surface to dungeon interior", () => {
    const dungeon = makeRect(0, 0, 100, 100);
    const surface = makeRect(50, 50, 100, 100);
    const clipped = geo.intersection(dungeon, surface);
    expect(clipped.getArea()).toBeCloseTo(50 * 50, -1);
  });

  it("difference clips surface to outside dungeon", () => {
    const dungeon = makeRect(0, 0, 100, 100);
    const surface = makeRect(50, 50, 100, 100);
    const clipped = geo.difference(surface, dungeon);
    expect(clipped.getArea()).toBeCloseTo(100 * 100 - 50 * 50, -1);
  });

  it("union merges overlapping surfaces", () => {
    const s1 = makeRect(0, 0, 100, 100);
    const s2 = makeRect(50, 0, 100, 100);
    const merged = geo.union(s1, s2);
    expect(merged.getArea()).toBeCloseTo(150 * 100, -1);
  });

  it("union of non-overlapping produces MultiPolygon", () => {
    const s1 = makeRect(0, 0, 50, 50);
    const s2 = makeRect(200, 200, 50, 50);
    const merged = geo.union(s1, s2);
    expect(merged.getNumGeometries()).toBe(2);
  });

  it("difference that splits produces MultiPolygon", () => {
    const surface = makeRect(0, 0, 100, 100);
    const eraser = makeRect(40, -10, 20, 120);
    const result = geo.difference(surface, eraser);
    expect(result.getNumGeometries()).toBe(2);
  });
});

describe("brush path deduplication", () => {
  function dedupe(path) {
    const result = [path[0]];
    for (let i = 1; i < path.length; i++) {
      const prev = result[result.length - 1];
      if (
        Math.abs(path[i].x - prev.x) > 0.5 ||
        Math.abs(path[i].y - prev.y) > 0.5
      ) {
        result.push(path[i]);
      }
    }
    return result;
  }

  it("removes consecutive identical points", () => {
    const path = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(dedupe(path)).toHaveLength(2);
  });

  it("removes near-identical points within 0.5px", () => {
    const path = [
      { x: 0, y: 0 },
      { x: 0.3, y: 0.2 },
      { x: 100, y: 0 },
    ];
    expect(dedupe(path)).toHaveLength(2);
  });

  it("keeps points that differ by more than 0.5px", () => {
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    expect(dedupe(path)).toHaveLength(3);
  });

  it("single point returns single point", () => {
    expect(dedupe([{ x: 5, y: 5 }])).toHaveLength(1);
  });
});

describe("snap-to-grid brush mode preservation", () => {
  function resolveShapeMode(actualMode, snapActive) {
    return actualMode === "brush"
      ? "brush"
      : snapActive
      ? "square"
      : actualMode;
  }

  it("brush is never overridden by snap", () => {
    expect(resolveShapeMode("brush", true)).toBe("brush");
    expect(resolveShapeMode("brush", false)).toBe("brush");
  });

  it("polygon becomes square when snap is on", () => {
    expect(resolveShapeMode("polygon", true)).toBe("square");
  });

  it("polygon stays polygon when snap is off", () => {
    expect(resolveShapeMode("polygon", false)).toBe("polygon");
  });

  it("ellipse becomes square when snap is on", () => {
    expect(resolveShapeMode("ellipse", true)).toBe("square");
  });

  it("grid becomes square when snap is on", () => {
    expect(resolveShapeMode("grid", true)).toBe("square");
  });
});

describe("brush buffer → merge → extract workflow", () => {
  it("two overlapping brush strokes merge into one polygon", () => {
    const line1 = geo.twoPointsToLineString(0, 0, 100, 0);
    const line2 = geo.twoPointsToLineString(80, 0, 180, 0);
    const b1 = geo.expandGeometry(line1, 10);
    const b2 = geo.expandGeometry(line2, 10);
    expect(geo.intersects(b1, b2)).toBe(true);
    const merged = geo.union(b1, b2);
    expect(merged.getNumGeometries()).toBe(1);
    expect(merged.getArea()).toBeGreaterThan(b1.getArea());
  });

  it("non-overlapping brush strokes stay separate", () => {
    const line1 = geo.twoPointsToLineString(0, 0, 50, 0);
    const line2 = geo.twoPointsToLineString(200, 0, 250, 0);
    const b1 = geo.expandGeometry(line1, 10);
    const b2 = geo.expandGeometry(line2, 10);
    expect(geo.intersects(b1, b2)).toBe(false);
  });

  it("erasing through a surface splits it", () => {
    const surface = makeRect(0, 0, 200, 100);
    const eraseLine = geo.twoPointsToLineString(100, -20, 100, 120);
    const eraser = geo.expandGeometry(eraseLine, 5);
    const result = geo.difference(surface, eraser);
    expect(result.getNumGeometries()).toBe(2);
    for (let i = 0; i < result.getNumGeometries(); i++) {
      expect(result.getGeometryN(i).getArea()).toBeGreaterThan(100);
    }
  });

  it("erasing the edge of a surface shrinks it", () => {
    const surface = makeRect(0, 0, 100, 100);
    const eraseLine = geo.twoPointsToLineString(-10, 50, 30, 50);
    const eraser = geo.expandGeometry(eraseLine, 10);
    const result = geo.difference(surface, eraser);
    expect(result.getArea()).toBeLessThan(surface.getArea());
    expect(result.getArea()).toBeGreaterThan(0);
  });
});
