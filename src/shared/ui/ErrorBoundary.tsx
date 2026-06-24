"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import Link from "next/link";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV === "development") {
      console.error("[ErrorBoundary]", error, info.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="mx-auto flex min-h-[40dvh] max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="typo-section-sm text-zinc-100">Algo salió mal</p>
            <p className="typo-body text-zinc-400">
              Recarga la página o vuelve al inicio. Si persiste, escríbenos por WhatsApp.
            </p>
            <Link
              href="/"
              className="btn-accent focus-ring typo-cta mt-2 rounded-xl px-5 py-3 active:scale-[0.98]"
            >
              Ir al inicio
            </Link>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
