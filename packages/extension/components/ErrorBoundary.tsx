import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  sectionName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ESPN Draft Assistant] ${this.props.sectionName ?? 'Component'} error:`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{ padding: '8px', color: '#dc2626', fontSize: '12px', borderTop: '1px solid #fecaca' }}>
          <span>{this.props.sectionName ?? 'Section'} error.</span>{' '}
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: '#dc2626', fontSize: '12px', padding: 0 }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
