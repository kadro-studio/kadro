import { Component, type ReactNode } from 'react';
import { t } from '../i18n';
import { autosaveNow } from '../store/autosave';

/** Last line of defence: save the project and offer a reload instead of a blank window. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error(error);
    void autosaveNow();
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash-screen">
        <h2>{t('crash.title')}</h2>
        <p>{t('crash.text')}</p>
        <pre className="error-box">{this.state.error.message}</pre>
        <button className="btn primary" onClick={() => location.reload()}>
          {t('crash.reload')}
        </button>
      </div>
    );
  }
}
