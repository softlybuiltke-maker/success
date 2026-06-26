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
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', backgroundColor: '#f8fafc', color: '#0f172a', fontFamily: 'sans-serif'
        }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Something went wrong.</h1>
          <p style={{ marginBottom: '2rem', color: '#475569' }}>
            We're sorry, but the application encountered an unexpected error.
          </p>
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
