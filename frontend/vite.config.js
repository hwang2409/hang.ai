import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/auth': 'http://localhost:8000',
      '/notes': 'http://localhost:8000',
      '/llm': 'http://localhost:8000',
      '/flashcards': 'http://localhost:8000',
      '/feynman': 'http://localhost:8000',
      '/annotations': 'http://localhost:8000',
      '/search': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/admin': 'http://localhost:8000',
      '/pomodoro': 'http://localhost:8000',
      '/imports': 'http://localhost:8000',
      '/todos': 'http://localhost:8000',
      '/files': 'http://localhost:8000',
      '/file-annotations': 'http://localhost:8000',
      '/lookups': 'http://localhost:8000',
    }
  }
})
