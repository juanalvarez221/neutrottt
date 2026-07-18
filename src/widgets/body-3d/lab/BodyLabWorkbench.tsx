"use client";

import { useState } from "react";
import { Body3DViewer } from "@/widgets/body-3d/Body3DViewer";
import { BodyLabControls } from "@/widgets/body-3d/lab/BodyLabControls";
import type {
  BodyAppearanceMode,
  BodyCameraView,
} from "@/widgets/body-3d/bodyViewerTypes";

export function BodyLabWorkbench() {
  const [cameraView, setCameraView] = useState<BodyCameraView>("front");
  const [cameraViewToken, setCameraViewToken] = useState(0);
  const [appearance, setAppearance] = useState<BodyAppearanceMode>("original");
  const [wireframe, setWireframe] = useState(false);

  function handleCameraViewChange(view: BodyCameraView) {
    setCameraView(view);
    setCameraViewToken((token) => token + 1);
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <Body3DViewer
          appearance={appearance}
          wireframe={wireframe}
          cameraView={cameraView}
          cameraViewToken={cameraViewToken}
          height="min(70dvh, 680px)"
        />
        <p className="mt-3 text-center text-xs text-zinc-500 sm:text-left">
          Arrastra para girar · Usa la rueda o gesto de pinza para acercar
        </p>
      </div>

      <BodyLabControls
        cameraView={cameraView}
        onCameraViewChange={handleCameraViewChange}
        appearance={appearance}
        onAppearanceChange={setAppearance}
        wireframe={wireframe}
        onWireframeChange={setWireframe}
      />
    </div>
  );
}
