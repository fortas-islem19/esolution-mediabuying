import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { supabaseConfigured } from './lib/api';
import './styles.css';

async function start() {
  const root = createRoot(document.getElementById('root')!);
  if (supabaseConfigured) {
    const { supabaseApi } = await import('./lib/api-supabase');
    root.render(<StrictMode><App api={supabaseApi} /></StrictMode>);
  } else {
    const { demoApi, hasDemoData, resetDemo } = await import('./lib/api-demo');
    root.render(<StrictMode><App api={demoApi} demo={{ hasData: hasDemoData(), reset: resetDemo }} /></StrictMode>);
  }
}

void start();
