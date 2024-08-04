import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import './App.css';

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<string>('');
  const [errors, setErrors] = useState<string[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({ onDrop, accept: '.pdf', noClick: true });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    window.electron.ipcRenderer.send('ping');
    if (file) {
      window.electron.ipcRenderer.send('parse-file', file.path);
      window.electron.ipcRenderer.once('parse-file-response', (event, response) => {
        if (response.success) {
          setResult(`File successfully saved to: ${response.savePath}`);
          setErrors(response.errors);
        } else {
          setResult(`Error: ${response.error}`);
          setErrors(response.errors || []);
        }
      });
    }
  };

  return (
    <div className="App">
      <form onSubmit={handleSubmit}>
        <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
          <input {...getInputProps()} />
          {
              <p>Drop the PDF file here ...</p>
          }
        </div>
        {file && <p>Selected file: {file.name}</p>}
        <button type="submit" disabled={!file} style={{marginRight: "20px"}}>
          Parse Statement
        </button>
        {
         file && 
         <button disabled={!file} 
          onClick={() => {
            setFile(null);
            setErrors([])
            setResult('')
          }}>
          Clear
        </button>
        }
      </form>
      {result && (
        <div>
          <h2>Result:</h2>
          <p>{result}</p>
        </div>
      )}
      {errors.length > 0 && (
        <div>
          <h2>Parsing Errors:</h2>
          <ul>
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;