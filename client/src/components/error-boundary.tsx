import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    const errorInfo = info.componentStack || "";
    this.setState({ errorInfo });
    console.error("[ErrorBoundary] Caught error:", error.message, errorInfo);
    try {
      const api = (window as any).electronAPI;
      if (api?.log) {
        api.log("error", "RENDERER", "ErrorBoundary", error.message, errorInfo);
      }
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            background: "#0f1729",
            color: "#e0e0e0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui, sans-serif",
            padding: "20px",
          }}
          data-testid="error-boundary-fallback"
        >
          <div style={{ maxWidth: 520, textAlign: "center" }}>
            <h1 style={{ marginBottom: 12, fontSize: 22 }}>Something went wrong</h1>
            <p style={{ opacity: 0.8, lineHeight: 1.6, marginBottom: 20, fontSize: 14 }}>
              The application encountered an unexpected error. This information can help with troubleshooting:
            </p>
            <div
              style={{
                background: "#1a2332",
                border: "1px solid #2a3a52",
                borderRadius: 8,
                padding: 16,
                textAlign: "left",
                fontSize: 12,
                fontFamily: "monospace",
                maxHeight: 200,
                overflow: "auto",
                marginBottom: 20,
                wordBreak: "break-word",
              }}
            >
              <div style={{ color: "#ff6b6b", marginBottom: 8 }}>
                {this.state.error?.message || "Unknown error"}
              </div>
              {this.state.errorInfo && (
                <div style={{ color: "#888", fontSize: 11, whiteSpace: "pre-wrap" }}>
                  {this.state.errorInfo.slice(0, 500)}
                </div>
              )}
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "12px 32px",
                fontSize: 16,
                border: "1px solid #4a4a6a",
                borderRadius: 8,
                background: "#2a2a4a",
                color: "#fff",
                cursor: "pointer",
                marginRight: 8,
              }}
              data-testid="button-error-reload"
            >
              Reload
            </button>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: "" });
              }}
              style={{
                padding: "12px 32px",
                fontSize: 16,
                border: "1px solid #4a4a6a",
                borderRadius: 8,
                background: "transparent",
                color: "#aaa",
                cursor: "pointer",
              }}
              data-testid="button-error-retry"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
