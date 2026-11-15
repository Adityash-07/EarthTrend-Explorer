// src/main.jsx
// This is the entry point of the React application.
// It finds the <div id="root"> in index.html and renders the <App /> component inside it.
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
