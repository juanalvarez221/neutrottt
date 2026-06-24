type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function safeStorageGet(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function safeStorageSet(storage: StorageLike, key: string, value: string): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeStorageRemove(storage: StorageLike, key: string): boolean {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function safeLocalStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  return safeStorageGet(window.localStorage, key);
}

export function safeLocalStorageSet(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  return safeStorageSet(window.localStorage, key, value);
}

export function safeLocalStorageRemove(key: string): boolean {
  if (typeof window === "undefined") return false;
  return safeStorageRemove(window.localStorage, key);
}

export function safeSessionStorageSet(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  return safeStorageSet(window.sessionStorage, key, value);
}
