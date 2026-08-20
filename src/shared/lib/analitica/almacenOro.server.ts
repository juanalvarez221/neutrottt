import { CAPA_ORO_VACIA, type CapaOro } from "@/shared/lib/analitica/tipos";
import { createJsonDocumentStorage } from "@/shared/lib/storage/jsonDocumentStorage.server";

const storage = createJsonDocumentStorage<CapaOro>({
  fileName: "analitica/oro.json",
  redisKey: "neutrott:analitica:oro",
});

export async function leerCapaOro(): Promise<CapaOro> {
  return (await storage.read()) ?? CAPA_ORO_VACIA;
}

export async function escribirCapaOro(oro: CapaOro): Promise<void> {
  await storage.write(oro);
}
