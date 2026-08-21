"use client";

import { usePathname } from "next/navigation";
import { DeferredChrome } from "@/widgets/layout/DeferredChrome";
import { isStaffUiPath } from "@/shared/config/adminGate";

/** El panel y el acceso del estudio no llevan dock, idioma ni atmósfera pública. */
export function PublicAtmosphere() {
  const pathname = usePathname();
  if (isStaffUiPath(pathname)) return null;
  return (
    <>
      <div aria-hidden className="amber-storm">
        <span className="amber-storm__flash amber-storm__flash--a" />
        <span className="amber-storm__flash amber-storm__flash--b" />
        <span className="amber-storm__flash amber-storm__flash--c" />
      </div>
      <DeferredChrome />
    </>
  );
}
