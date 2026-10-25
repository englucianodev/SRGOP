import { Component } from 'react';
export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    console.error('Interface/React:', error);
  }
  render() {
    return this.state.error ? (
      <div className="fatal-error" role="alert">
        <h1>Não foi possível exibir esta página</h1>
        <p>Origem: interface React. Recarregue o Dashboard para continuar.</p>
        <a className="button primary" href="/dashboard">
          Ir ao Dashboard
        </a>
      </div>
    ) : (
      this.props.children
    );
  }
}
