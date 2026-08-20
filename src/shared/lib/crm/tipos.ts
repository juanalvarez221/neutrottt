export const ESTADOS_PERSONA = ["crudo", "prospecto", "cliente"] as const;
export type EstadoPersona = (typeof ESTADOS_PERSONA)[number];

export const EVENTOS_CRM = [
  "captura",
  "cotizacion_enviada",
  "asesoria_agendada",
  "cotizacion_aceptada",
  "acuerdo_asesoria",
] as const;
export type EventoCrm = (typeof EVENTOS_CRM)[number];

export const ETIQUETAS_ESTADO: Record<EstadoPersona, string> = {
  crudo: "Crudo",
  prospecto: "Prospecto",
  cliente: "Cliente",
};

export type Persona = {
  id: string;
  nombre: string;
  whatsapp: string;
  email: string;
  estado: EstadoPersona;
  origen: string;
  id_visitante: string | null;
  creado_en: string;
  actualizado_en: string;
  pasado_a_prospecto_en: string | null;
  pasado_a_cliente_en: string | null;
};

export type PersonaHecho = {
  id: string;
  persona_id: string;
  tipo: EventoCrm;
  detalle: string | null;
  referencia_id: string | null;
  ocurrido_en: string;
};

export type RegistroCrmInput = {
  nombre: string;
  whatsapp?: string;
  email?: string;
  evento: EventoCrm;
  origen?: string;
  referencia_id?: string;
  detalle?: string;
  id_visitante?: string;
};
