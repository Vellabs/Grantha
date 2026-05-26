import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { Settings, CheckCircle, XCircle, Loader2, Save } from 'lucide-react';

export const SetupWizard: React.FC = () => {
  const { 
    ollamaUrl, 
    model: currentModel, 
    availableModels, 
    connectivityStatus, 
    saveSettings, 
    checkConnectivity,
    setAppView
  } = useStore();

  const [url, setUrl] = useState(ollamaUrl);
  const [selectedModel, setSelectedModel] = useState(currentModel);

  useEffect(() => {
    setUrl(ollamaUrl);
    setSelectedModel(currentModel);
  }, [ollamaUrl, currentModel]);

  const handleUrlBlur = () => {
    checkConnectivity(url);
  };

  const handleSave = () => {
    if (url && selectedModel) {
      saveSettings(url, selectedModel);
    }
  };

  return (
    <div className="setup-wizard">
      <div className="setup-card">
        <div className="setup-header">
          <Settings size={24} />
          <h1>Grantha Setup</h1>
        </div>
        
        <p className="setup-description">
          Grantha requires a local Ollama instance to function. 
          Please configure your connection details below.
        </p>

        <div className="setup-field">
          <label>Ollama API URL</label>
          <div className="input-with-status">
            <input 
              type="text" 
              value={url} 
              onChange={(e) => setUrl(e.target.value)} 
              onBlur={handleUrlBlur}
              placeholder="http://localhost:11434"
            />
            <div className="status-indicator">
              {connectivityStatus === 'checking' && <Loader2 className="animate-spin text-blue-500" size={18} />}
              {connectivityStatus === 'connected' && <CheckCircle className="text-green-500" size={18} />}
              {connectivityStatus === 'error' && <XCircle className="text-red-500" size={18} />}
            </div>
          </div>
          {connectivityStatus === 'error' && (
            <p className="error-text">Could not connect to Ollama. Is it running?</p>
          )}
        </div>

        <div className="setup-field">
          <label>AI Model</label>
          <select 
            value={selectedModel} 
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={connectivityStatus !== 'connected'}
          >
            <option value="" disabled>Select a model</option>
            {availableModels.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <p className="helper-text">
            Recommended: <code>gemma2:27b</code> or <code>llama3.1:8b</code>.
          </p>
        </div>

        <div className="setup-actions">
          <button 
            className="secondary-button"
            onClick={() => setAppView('search')}
          >
            Cancel
          </button>
          <button 
            className="primary-button" 
            onClick={handleSave}
            disabled={!selectedModel || connectivityStatus !== 'connected'}
          >
            <Save size={18} />
            Save & Continue
          </button>
        </div>
      </div>
    </div>
  );
};
