import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'

// Self-hosted fonts (Google Fonts CDN 제거 — 오프라인 로드 + 프라이버시).
// 실제 사용 weight만 import (index.html css2 쿼리 기준). 모두 SIL OFL 1.1.
import '@fontsource/pixelify-sans/400.css'
import '@fontsource/pixelify-sans/500.css'
import '@fontsource/pixelify-sans/700.css'
import '@fontsource/dotgothic16/400.css'
import '@fontsource/noto-sans-kr/400.css'
import '@fontsource/noto-sans-kr/500.css'
import '@fontsource/noto-sans-kr/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/700.css'

import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Use contextBridge
window.ipcRenderer.on('main-process-message', (_event, message) => {
  console.log(message)
})
