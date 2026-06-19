import type { AdvisoryStore } from "@/shared/lib/advisoryTypes";

/**
 * Contrato de almacenamiento para la agenda de asesorías.
 * La lógica de negocio depende de esta interfaz, no del medio concreto
 * (archivo local en desarrollo, Upstash Redis en producción).
 */
export interface AdvisoryStorageAdapter {
  /** Identificador del medio: "file" | "redis". */
  readonly name: "file" | "redis";
  /** Devuelve el store persistido o null si todavía no existe. */
  read(): Promise<AdvisoryStore | null>;
  /** Persiste el store completo. Debe lanzar error si la escritura falla. */
  write(store: AdvisoryStore): Promise<void>;
}
