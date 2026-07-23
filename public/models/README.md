# Modelos 3D — Neutro

Assets corporales usados por el laboratorio 3D y, en el futuro, por el selector de producción.

## Estructura

```text
public/models/
├── prototypes/     # Assets de evaluación técnica (no producción)
├── production/     # Modelos aprobados para el producto
└── README.md
```

## Prototipos

### Tripo human prototype

Archivo:

`prototypes/tripo-human-prototype.glb`

Procedencia:

Repositorio de referencia: [bhagyeshsave/human-3d-body](https://github.com/bhagyeshsave/human-3d-body)

Hallazgo del metadata GLB:

`Generator: https://tripo3d.ai`

Uso actual:

**Prototipo técnico únicamente. No aprobado como modelo final de producción.**

Sirve para:

* validar React Three Fiber / Drei;
* probar cámara y controles del laboratorio;
* ensayar la integración de assets GLB en Next.js.

No debe usarse para:

* segmentación de zonas;
* experiencia de cotización en producción;
* materiales definitivos de marca.

Advertencia:

**La licencia y procedencia original del asset no están suficientemente verificadas para considerarlo un asset definitivo de producción.**

## Producción

### Neutro body v1 (previsto)

Ruta prevista:

`production/neutro_body_v1.glb`

Estado: pendiente de creación (herramienta de generación humana + Blender).

Cuando exista el archivo, registrarlo en `src/widgets/body-3d/bodyModelDefinition.ts` y añadirlo a `AVAILABLE_BODY_MODELS` del laboratorio.
