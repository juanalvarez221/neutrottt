/**
 * Error boundary específico del selector 3D → fallback 2D.
 * resetKey permite remount limpio al volver a la ruta.
 */

"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Body3DErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
  onError?: () => void;
  /** Al cambiar, limpia el estado de error (remount lógico). */
  resetKey?: string | number;
};

type Body3DErrorBoundaryState = {
  hasError: boolean;
};

export class Body3DErrorBoundary extends Component<
  Body3DErrorBoundaryProps,
  Body3DErrorBoundaryState
> {
  state: Body3DErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): Body3DErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.();
    if (process.env.NODE_ENV === "development") {
      console.error("[Body3DErrorBoundary]", error, info.componentStack);
    }
  }

  componentDidUpdate(prevProps: Body3DErrorBoundaryProps) {
    if (
      prevProps.resetKey !== this.props.resetKey &&
      this.state.hasError
    ) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
