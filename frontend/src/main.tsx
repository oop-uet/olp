import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Handle dynamic import / chunk loading failures (due to new deployments removing old hashes)
// by automatically force-reloading the page to fetch the latest assets.
window.addEventListener('error', (event) => {
  const isChunkError =
    event.message?.includes('Failed to fetch dynamically imported module') ||
    event.message?.includes('error loading dynamically imported module') ||
    (event.target &&
      (event.target as HTMLElement).tagName === 'SCRIPT' &&
      (event.target as HTMLScriptElement).src?.includes('/assets/'));

  if (isChunkError) {
    event.preventDefault();
    console.warn('Chunk loading error detected. Reloading page to fetch latest version...');
    window.location.reload();
  }
}, true);

window.addEventListener('unhandledrejection', (event) => {
  const errorMsg = event.reason?.message || event.reason?.toString() || '';
  if (
    errorMsg.includes('Failed to fetch dynamically imported module') ||
    errorMsg.includes('error loading dynamically imported module')
  ) {
    event.preventDefault();
    console.warn('Dynamic import failed. Reloading page to fetch latest version...');
    window.location.reload();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const baseUrl = import.meta.env.BASE_URL
    navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl }).catch(() => {
      // The app remains fully functional without the offline/static cache.
    })
  })
}
