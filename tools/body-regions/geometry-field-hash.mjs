/**
 * Canonical geometry identity hashes shared by the offline generator and the
 * runtime loader. Byte layout is explicit (little-endian) so the value never
 * depends on the underlying TypedArray storage of either side.
 */

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnvStep(hash, byte) {
  let h = (hash ^ byte) >>> 0;
  h = Math.imul(h, FNV_PRIME) >>> 0;
  return h;
}

/** FNV-1a over float32 values written as 4 little-endian bytes each. */
export function hashFloat32Canonical(values) {
  const scratch = new DataView(new ArrayBuffer(4));
  let hash = FNV_OFFSET >>> 0;
  for (let i = 0; i < values.length; i++) {
    scratch.setFloat32(0, values[i], true);
    hash = fnvStep(hash, scratch.getUint8(0));
    hash = fnvStep(hash, scratch.getUint8(1));
    hash = fnvStep(hash, scratch.getUint8(2));
    hash = fnvStep(hash, scratch.getUint8(3));
  }
  return `${(hash >>> 0).toString(16).padStart(8, "0")}${values.length.toString(16)}`;
}

/** FNV-1a over integer values written as 4 little-endian bytes each. */
export function hashUint32Canonical(values) {
  const scratch = new DataView(new ArrayBuffer(4));
  let hash = FNV_OFFSET >>> 0;
  for (let i = 0; i < values.length; i++) {
    scratch.setUint32(0, values[i] >>> 0, true);
    hash = fnvStep(hash, scratch.getUint8(0));
    hash = fnvStep(hash, scratch.getUint8(1));
    hash = fnvStep(hash, scratch.getUint8(2));
    hash = fnvStep(hash, scratch.getUint8(3));
  }
  return `${(hash >>> 0).toString(16).padStart(8, "0")}${values.length.toString(16)}`;
}
