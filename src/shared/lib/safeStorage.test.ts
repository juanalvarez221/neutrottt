import { describe, expect, it, vi } from "vitest";
import {
  safeLocalStorageSet,
  safeSessionStorageSet,
  safeStorageGet,
  safeStorageRemove,
  safeStorageSet,
} from "./safeStorage";

describe("safeStorage", () => {
  it("returns stored values and swallows read errors", () => {
    const storage = {
      getItem: vi.fn().mockReturnValue("es"),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    expect(safeStorageGet(storage, "lang")).toBe("es");

    storage.getItem.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(safeStorageGet(storage, "lang")).toBeNull();
  });

  it("reports write/remove failures without throwing", () => {
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    expect(safeStorageSet(storage, "draft", "{}")).toBe(true);
    expect(safeStorageRemove(storage, "draft")).toBe(true);

    storage.setItem.mockImplementation(() => {
      throw new DOMException("quota");
    });
    expect(safeStorageSet(storage, "draft", "{}")).toBe(false);

    storage.removeItem.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(safeStorageRemove(storage, "draft")).toBe(false);
  });

  it("no-ops window helpers during SSR", () => {
    expect(safeLocalStorageSet("lang", "es")).toBe(false);
    expect(safeSessionStorageSet("lang", "es")).toBe(false);
  });
});
