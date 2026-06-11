import { useRef, useState } from 'react';

export default function UploadZone({ onFile }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) onFile(file);
  }

  function handleChange(e) {
    const file = e.target.files[0];
    if (file) { onFile(file); e.target.value = ''; }
  }

  return (
    <div className="text-center">
      <div
        className={`border-2 border-dashed rounded-xl w-[480px] h-[280px] flex flex-col items-center justify-center cursor-pointer transition-all ${
          dragging
            ? 'border-accent bg-accent-light'
            : 'border-border bg-white hover:border-accent/40 hover:bg-accent-light/50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${dragging ? 'bg-accent/10' : 'bg-bg'}`}>
          <svg className={`w-7 h-7 ${dragging ? 'text-accent' : 'text-text-secondary'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <p className="font-ui font-semibold text-text-primary text-base mb-1">
          Drop CSV here or click to browse
        </p>
        <p className="text-text-secondary text-sm font-ui">
          Google Sheets export · .csv files only
        </p>
        <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={handleChange} />
      </div>
      <p className="mt-4 text-xs text-text-secondary font-mono">
        Previous session data will load automatically if available
      </p>
    </div>
  );
}
