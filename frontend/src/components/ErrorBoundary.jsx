import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('Uncaught error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg p-4">
          <div className="text-center max-w-sm">
            <h1 className="text-lg font-medium text-text mb-2">
              something went wrong
            </h1>
            <p className="text-sm text-text-secondary mb-4">
              {this.state.error?.message || 'an unexpected error occurred'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm bg-bg-secondary border border-border rounded-md text-text hover:bg-bg-tertiary transition-colors"
            >
              reload page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
