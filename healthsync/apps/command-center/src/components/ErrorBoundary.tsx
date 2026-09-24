import React from 'react';

// ─── Props ─────────────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  label?: string; // nama halaman/komponen untuk pesan error
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

// ─── ErrorBoundary Class Component ────────────────────────────────────────

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log ke console saja, tidak crash seluruh app
    console.error(`[ErrorBoundary] ${this.props.label ?? 'Component'} error:`, error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 10,
          padding: '24px 20px',
          textAlign: 'center',
          margin: '8px 0',
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>
            {this.props.label ? `Gagal memuat: ${this.props.label}` : 'Komponen mengalami error'}
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 14, fontFamily: 'monospace' }}>
            {this.state.errorMessage || 'Terjadi kesalahan yang tidak diketahui'}
          </div>
          <button
            onClick={this.handleReset}
            style={{
              padding: '7px 18px',
              background: '#dc2626', color: '#fff',
              border: 'none', borderRadius: 6,
              fontSize: 13, cursor: 'pointer', fontWeight: 600,
            }}
          >
            ↻ Coba Lagi
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// ─── HOC untuk membungkus halaman penuh ──────────────────────────────────

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  label: string,
) {
  return function BoundedComponent(props: P) {
    return (
      <ErrorBoundary label={label}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
