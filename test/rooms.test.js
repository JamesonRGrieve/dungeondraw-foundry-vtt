import { describe, it, expect } from "vitest";
import * as geo from "../src/geo-utils.js";

const makeRect = (x, y, w, h) =>
  geo.rectToPolygon({ x, y, width: w, height: h });

describe("splitIntoRooms", () => {
  it("returns one room for geometry with no walls or doors", () => {
    const rect = makeRect(0, 0, 100, 100);
    const rooms = geo.splitIntoRooms(rect, [], [], 8, []);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].getArea()).toBeGreaterThan(0);
  });

  it("splits geometry into two rooms by an interior wall", () => {
    const rect = makeRect(0, 0, 200, 100);
    const wall = [100, 0, 100, 100];
    const rooms = geo.splitIntoRooms(rect, [wall], [], 8, []);
    expect(rooms).toHaveLength(2);
    for (const room of rooms) {
      expect(room.getArea()).toBeGreaterThan(100);
    }
  });

  it("splits geometry into two rooms by a door", () => {
    const rect = makeRect(0, 0, 200, 100);
    const door = [100, 0, 100, 100];
    const rooms = geo.splitIntoRooms(rect, [], [], 8, [door]);
    expect(rooms).toHaveLength(2);
  });

  it("splits geometry by both walls and doors", () => {
    const rect = makeRect(0, 0, 300, 100);
    const wall = [100, 0, 100, 100];
    const door = [200, 0, 200, 100];
    const rooms = geo.splitIntoRooms(rect, [wall], [], 8, [door]);
    expect(rooms).toHaveLength(3);
  });

  it("returns empty array for null geometry", () => {
    expect(geo.splitIntoRooms(null, [], [], 8, [])).toEqual([]);
  });

  it("filters out tiny fragments below area threshold", () => {
    const rect = makeRect(0, 0, 200, 100);
    const wall = [100, 0, 100, 100];
    const rooms = geo.splitIntoRooms(rect, [wall], [], 8, []);
    for (const room of rooms) {
      expect(room.getArea()).toBeGreaterThan(100);
    }
  });

  it("handles multiple parallel interior walls (jail cells)", () => {
    const rect = makeRect(0, 0, 400, 100);
    const walls = [
      [100, 0, 100, 100],
      [200, 0, 200, 100],
      [300, 0, 300, 100],
    ];
    const rooms = geo.splitIntoRooms(rect, walls, [], 8, []);
    expect(rooms).toHaveLength(4);
  });

  it("handles L-shaped geometry with a wall", () => {
    const r1 = makeRect(0, 0, 200, 100);
    const r2 = makeRect(0, 100, 100, 100);
    const lShape = geo.union(r1, r2);
    const wall = [100, 0, 100, 100];
    const rooms = geo.splitIntoRooms(lShape, [wall], [], 8, []);
    expect(rooms.length).toBeGreaterThanOrEqual(2);
  });

  it("handles generated dungeon geometry (MultiPolygon)", () => {
    const r1 = makeRect(0, 0, 100, 100);
    const r2 = makeRect(200, 0, 100, 100);
    const multi = geo.union(r1, r2);
    expect(multi.getNumGeometries()).toBe(2);
    const rooms = geo.splitIntoRooms(multi, [], [], 8, []);
    expect(rooms).toHaveLength(2);
  });
});

describe("findRoomAtPoint", () => {
  it("returns the room containing the point", () => {
    const rect = makeRect(0, 0, 200, 100);
    const wall = [100, 0, 100, 100];
    const hit = geo.findRoomAtPoint(rect, [wall], [], 8, 50, 50, []);
    expect(hit).not.toBeNull();
    expect(hit.id).toBeTruthy();
    expect(hit.room.getArea()).toBeGreaterThan(0);
  });

  it("returns null for a point outside geometry", () => {
    const rect = makeRect(0, 0, 100, 100);
    const hit = geo.findRoomAtPoint(rect, [], [], 8, 500, 500, []);
    expect(hit).toBeNull();
  });

  it("returns null for a point on a wall", () => {
    const rect = makeRect(0, 0, 200, 100);
    const wall = [100, 0, 100, 100];
    const hit = geo.findRoomAtPoint(rect, [wall], [], 8, 100, 50, []);
    expect(hit).toBeNull();
  });

  it("returns different rooms for points on different sides of a wall", () => {
    const rect = makeRect(0, 0, 200, 100);
    const wall = [100, 0, 100, 100];
    const left = geo.findRoomAtPoint(rect, [wall], [], 8, 30, 50, []);
    const right = geo.findRoomAtPoint(rect, [wall], [], 8, 170, 50, []);
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect(left.id).not.toEqual(right.id);
  });

  it("finds rooms separated by doors", () => {
    const rect = makeRect(0, 0, 200, 100);
    const door = [100, 0, 100, 100];
    const left = geo.findRoomAtPoint(rect, [], [], 8, 30, 50, [door]);
    const right = geo.findRoomAtPoint(rect, [], [], 8, 170, 50, [door]);
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect(left.id).not.toEqual(right.id);
  });

  it("returns null for null geometry", () => {
    const hit = geo.findRoomAtPoint(null, [], [], 8, 50, 50, []);
    expect(hit).toBeNull();
  });
});

describe("roomId", () => {
  it("generates stable IDs for the same geometry", () => {
    const rect = makeRect(50, 50, 100, 100);
    const id1 = geo.roomId(rect);
    const id2 = geo.roomId(rect);
    expect(id1).toEqual(id2);
  });

  it("generates different IDs for different positions", () => {
    const rect1 = makeRect(0, 0, 100, 100);
    const rect2 = makeRect(500, 500, 100, 100);
    expect(geo.roomId(rect1)).not.toEqual(geo.roomId(rect2));
  });

  it("starts with room_ prefix", () => {
    const rect = makeRect(0, 0, 100, 100);
    expect(geo.roomId(rect)).toMatch(/^room_\d+_\d+$/);
  });

  it("same-size rooms at different positions get different IDs", () => {
    const rect = makeRect(0, 0, 200, 100);
    const wall = [100, 0, 100, 100];
    const rooms = geo.splitIntoRooms(rect, [wall], [], 8, []);
    expect(rooms).toHaveLength(2);
    expect(geo.roomId(rooms[0])).not.toEqual(geo.roomId(rooms[1]));
  });
});

describe("getAllRooms", () => {
  it("returns rooms with ids and points", () => {
    const rect = makeRect(0, 0, 200, 100);
    const wall = [100, 0, 100, 100];
    const rooms = geo.getAllRooms(rect, [wall], [], 8, []);
    expect(rooms).toHaveLength(2);
    for (const room of rooms) {
      expect(room.id).toBeTruthy();
      expect(room.points).toBeInstanceOf(Array);
      expect(room.points.length).toBeGreaterThan(3);
      expect(room.room.getArea()).toBeGreaterThan(0);
    }
  });

  it("points arrays are closed rings", () => {
    const rect = makeRect(0, 0, 100, 100);
    const rooms = geo.getAllRooms(rect, [], [], 8, []);
    for (const room of rooms) {
      const first = room.points[0];
      const last = room.points[room.points.length - 1];
      expect(first[0]).toBeCloseTo(last[0], 0);
      expect(first[1]).toBeCloseTo(last[1], 0);
    }
  });

  it("works with doors for generated dungeons", () => {
    const rect = makeRect(0, 0, 300, 100);
    const door1 = [100, 0, 100, 100];
    const door2 = [200, 0, 200, 100];
    const rooms = geo.getAllRooms(rect, [], [], 8, [door1, door2]);
    expect(rooms).toHaveLength(3);
  });
});

describe("room-in-room (shared walls)", () => {
  it("sub-rooms share outer walls with parent", () => {
    const rect = makeRect(0, 0, 300, 200);
    const walls = [
      [100, 0, 100, 200],
      [200, 0, 200, 200],
      [100, 100, 200, 100],
    ];
    const rooms = geo.splitIntoRooms(rect, walls, [], 8, []);
    expect(rooms.length).toBeGreaterThanOrEqual(4);
  });

  it("each sub-room is individually addressable by point", () => {
    const rect = makeRect(0, 0, 300, 200);
    const walls = [
      [100, 0, 100, 200],
      [200, 0, 200, 200],
    ];
    const r1 = geo.findRoomAtPoint(rect, walls, [], 8, 50, 100, []);
    const r2 = geo.findRoomAtPoint(rect, walls, [], 8, 150, 100, []);
    const r3 = geo.findRoomAtPoint(rect, walls, [], 8, 250, 100, []);
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r3).not.toBeNull();
    const ids = new Set([r1.id, r2.id, r3.id]);
    expect(ids.size).toBe(3);
  });
});
