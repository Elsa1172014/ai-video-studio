'use client';

import {useState} from 'react';

export default function ExportPanel() {
  const [message,setMessage] = useState('');

  async function render() {
    setMessage('Preparing render…');
    try {
      const response = await fetch('/api/render',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({clips:[]})
      });
      const data = await response.json();
      setMessage(data.message || data.error || data.outputUrl || data.status || 'Render submitted');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Render failed');
    }
  }

  return (
    <div className="card mt-6 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-purple-400">EXPORT</p>
          <h2 className="font-bold">Final MP4</h2>
        </div>
        <button type="button" onClick={render} className="btn primary">Render video</button>
      </div>
      {message && <p className="mt-3 text-sm text-slate-400">{message}</p>}
    </div>
  );
}
