# Guía rápida — curar máscara anatómica del torso (Neutro)

Esta guía es para **pintar a mano** las regiones del torso en Blender.
No hace falta ser experto. No toques brazos, piernas, cabeza ni cuello.

## Qué vas a hacer

Corregir visualmente, en este orden:

1. Pectoral derecho  
2. Reflejar → Pectoral izquierdo  
3. Revisar ambos  
4. Abdomen completo  
5. Costillas derechas  
6. Reflejar → Costillas izquierdas  
7. Espalda alta  
8. Espalda baja  
9. Revisar espalda completa  

No declares PASS todavía. Solo cura y guarda.

---

## 1. Abrir la sesión

En PowerShell, desde la raíz del repo:

```powershell
powershell -ExecutionPolicy Bypass -File tools/body-regions/open-torso-authoring.ps1
```

Eso:

- encuentra Blender  
- hace backup de la máscara  
- abre el archivo de autoría  
- deja listo Texture Paint  

Archivo: `assets/blender/neutro-body/neutro_body_v1_anatomical_mask_authoring.blend`

---

## 2. Dónde está el panel

En el viewport 3D:

1. Pulsa `N` (barra lateral)  
2. Pestaña **NEUTRO**  
3. Panel **Anatomical Mask**

Si no lo ves: en el panel pulsa **Prepare Session**.

---

## 3. Objeto que se pinta

Solo pinta sobre:

```text
NEUTRO_BODY_MASK_AUTHORING
```

No selecciones luces, cámaras, guías ni landmarks (están bloqueados).

No muevas ni escales el cuerpo (transforms bloqueados).

---

## 4. Elegir una región

En **Regiones del torso**, pulsa por ejemplo **Pectoral derecho**.

Eso:

- fija el color exacto de la paleta  
- configura el pincel (Mix, fuerza 1, falloff duro)  
- muestra la región activa  

No uses el selector de color libre de Blender.

---

## 5. Pintar

1. **Erase to non-selectable** — borra la forma procedural mala  
2. **Paint active region** — pinta el pecho  
3. Empieza en el centro y expande hacia los límites  

Pincel seguro ya configurado:

- Blend: Mix  
- Strength: 1.0  
- Falloff: Hard  
- Color: solo IDs de paleta  

---

## 6. Borrar

**Erase to non-selectable** pinta negro (ID 0).

Úsalo para limpiar dientes, picos o invasiones.

---

## 7. Cambiar de cámara

En el panel, botones:

- Front  
- Front Right 30  
- Front Left 30  
- Right / Left  
- Back  
- Back Right 30 / Back Left 30  

Contrato:

```text
front = +Z
back = -Z
```

Revisa siempre más de una vista antes de dar por buena una región.

---

## 8. Reflejar (solo pares)

Después de aprobar visualmente el **Pectoral derecho**:

1. Región activa: Pectoral derecho (o izquierdo)  
2. **Mirror right region to left**  

Luego revisa el izquierdo en Front / Front Left 30 / Left.

Igual para costillas.

No uses mirror en abdomen ni espalda.

---

## 9. Guardar

Pulsa **Save Authoring Mask**.

Eso:

1. guarda la PNG editable  
2. crea backup con fecha en `assets/body-regions/backups/`  

También puedes usar **Create Backup** o **Restore Last Backup**.

---

## 10. Validar (técnico, no anatómico)

**Validate Current Mask** reporta:

- colores desconocidos  
- transparentes  
- regiones torso ausentes  
- avisos de UV seams  

No dice si la anatomía se ve bien. Eso lo decides tú mirando el cuerpo.

---

## 11. Exportar máscara runtime

**Quantize and Export Runtime Mask**

Equivale a:

```powershell
node tools/body-regions/quantize-anatomical-mask.mjs
```

Debe quedar: IDs desconocidos = 0.

---

## 12. Render QA (19 imágenes)

**Render Torso Gate**

Genera:

```text
artifacts/manual-anatomical-mask-gate-torso/
```

No se versionan en git.

---

## Pectoral derecho — checklist

- Superior: debajo de la clavícula  
- Medial: línea esternal  
- Lateral: pliegue axilar anterior  
- Inferior: curva real bajo el pecho  
- Sin esquinas rectas  
- Sin mitad vertical del torso  
- Sin invadir abdomen / costillas en exceso  

Resultado: superficie curva, ancha, reconocible como pecho.

---

## UV sync (critical)

Texture Paint must use the **same UVs as** `public/models/production/neutro_body_v1.glb`.

If the authoring mesh diverges, rebuild:

```powershell
& $env:BLENDER_EXE --background --python tools/body-regions/blender/resync_authoring_uv_from_glb.py
```

Do not paint on a mesh whose UVs differ from production — runtime highlights will not match.

---

## Si algo falla

1. **Prepare Session**  
2. **Load Authoring Mask**  
3. **Restore Last Backup**  
4. Reabrir con `open-torso-authoring.ps1`

Manual técnico de paths: `tools/body-regions/README.md`
