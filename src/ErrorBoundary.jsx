import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', backgroundColor: '#f8fafc', color: '#0f172a', fontFamily: 'sans-serif', padding: '2rem'
        }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#ef4444' }}>Something went wrong.</h1>
          <p style={{ marginBottom: '1rem', color: '#475569' }}>
            The application encountered an unexpected error.
          </p>
          <div style={{ background: '#f1f5f9', padding: '1rem', borderRadius: '8px', width: '100%', maxWidth: '800px', overflowX: 'auto', marginBottom: '2rem' }}>
            <p style={{ fontWeight: 'bold', color: '#b91c1c' }}>{this.state.error && this.state.error.toString()}</p>
            <pre style={{ fontSize: '0.875rem', color: '#334155', marginTop: '1rem' }}>
              {this.state.errorInfo && this.state.errorInfo.componentStack}
            </pre>
          </div>
          <button 
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', 
              border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem'
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
