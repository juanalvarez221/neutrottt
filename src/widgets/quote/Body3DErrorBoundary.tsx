/**
 * Error boundary específico del selector 3D → fallback 2D.
 */

"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Body3DErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
  onError?: () => void;
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

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
