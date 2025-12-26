import React, { useState, useEffect } from 'react';
import { postExtract, postExtractPDF } from './api';

// Constants
const MIN_KEYWORDS = 5;
const MAX_KEYWORDS = 20;
const MIN_TEXT_LENGTH = 10;
const MAX_TEXT_LENGTH = 50000;

// Toast notification component
function Toast({ message, type = 'error', onClose }) {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 4000);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div className={`toast toast-${type}`}>
            <span>{message}</span>
            <button onClick={onClose} className="toast-close">&times;</button>
        </div>
    );
}

// Loading spinner component
function LoadingSpinner() {
    return (
        <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Processing your text...</p>
        </div>
    );
}

export default function App() {
    const [text, setText] = useState('');
    const [file, setFile] = useState(null);
    const [topN, setTopN] = useState(10);
    const [ngMin, setNgMin] = useState(1);
    const [ngMax, setNgMax] = useState(3);
    const [advanced, setAdvanced] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [toast, setToast] = useState(null);

    const showToast = (message, type = 'error') => {
        setToast({ message, type });
    };

    const clearForm = () => {
        setText('');
        setFile(null);
        setResult(null);
        // Reset file input
        const fileInput = document.getElementById('pdf-upload');
        if (fileInput) fileInput.value = '';
    };

    const removeFile = () => {
        setFile(null);
        const fileInput = document.getElementById('pdf-upload');
        if (fileInput) fileInput.value = '';
    };

    const copyToClipboard = async (text, label = 'Text') => {
        try {
            await navigator.clipboard.writeText(text);
            showToast(`${label} copied to clipboard!`, 'success');
        } catch (err) {
            showToast('Failed to copy to clipboard', 'error');
        }
    };

    const submit = async () => {
        if (!file && !text.trim()) {
            showToast('Please enter text or upload a PDF file', 'error');
            return;
        }

        if (!file && text.trim().length < MIN_TEXT_LENGTH) {
            showToast(`Text must be at least ${MIN_TEXT_LENGTH} characters`, 'error');
            return;
        }

        if (!file && text.length > MAX_TEXT_LENGTH) {
            showToast(`Text must be less than ${MAX_TEXT_LENGTH} characters`, 'error');
            return;
        }

        setLoading(true);
        setResult(null);
        try {
            if (file) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('top_n', topN);
                formData.append('ng_min', ngMin);
                formData.append('ng_max', ngMax);
                const data = await postExtractPDF(formData);
                setResult(data);
                showToast('Analysis completed successfully!', 'success');
            } else if (text.trim()) {
                const data = await postExtract({ text, top_n: topN, ng_min: ngMin, ng_max: ngMax });
                setResult(data);
                showToast('Analysis completed successfully!', 'success');
            }
        } catch (err) {
            console.error(err);
            const errorMsg = err.response?.data?.error || 'Error processing request. Make sure backend is running.';
            showToast(errorMsg, 'error');
        }
        setLoading(false);
    };

    const downloadCSV = () => {
        if (!result) return;
        const rows = [
            ['Rule-Based Keywords', 'ML-Based Keywords'],
            ...result.rule_keywords.map((r, i) => [r, result.ml_keywords[i] || ''])
        ];
        const csv = rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'keywords.csv';
        a.click();
        URL.revokeObjectURL(url);
        showToast('CSV file downloaded!', 'success');
    };

    const getWordCount = (text) => {
        return text.trim() ? text.trim().split(/\s+/).length : 0;
    };

    const getCharCount = (text) => {
        return text.length;
    };

    return (
        <div className="app-root">
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}

            <aside className={`sidebar ${!sidebarOpen ? 'collapsed' : ''}`}>
                <div className="sidebar-header">
                    <div className="logo">
                        <h2>Keyword Intelligence</h2>
                    </div>
                </div>

                <div className="settings">
                    <h3>Settings</h3>

                    <div className="setting-group">
                        <label>Top Keywords ({topN})</label>
                        <input
                            type="range"
                            min={MIN_KEYWORDS}
                            max={MAX_KEYWORDS}
                            value={topN}
                            onChange={e => setTopN(Number(e.target.value))}
                            className="slider"
                        />
                    </div>

                    <div className="setting-group">
                        <label className="checkbox-label">
                            <input
                                type="checkbox"
                                checked={advanced}
                                onChange={() => setAdvanced(a => !a)}
                            />
                            <span>Advanced Options</span>
                        </label>
                    </div>

                    {advanced && (
                        <div className="advanced-settings">
                            <div className="setting-group">
                                <label>N-gram Min</label>
                                <select value={ngMin} onChange={e => setNgMin(Number(e.target.value))}>
                                    <option value={1}>1</option>
                                    <option value={2}>2</option>
                                    <option value={3}>3</option>
                                </select>
                            </div>

                            <div className="setting-group">
                                <label>N-gram Max</label>
                                <select value={ngMax} onChange={e => setNgMax(Number(e.target.value))}>
                                    <option value={1}>1</option>
                                    <option value={2}>2</option>
                                    <option value={3}>3</option>
                                </select>
                            </div>
                        </div>
                    )}
                </div>
            </aside>

            <main className="main">
                <button
                    className="sidebar-toggle"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    aria-label="Toggle sidebar"
                >
                    <span></span>
                    <span></span>
                    <span></span>
                </button>

                <div className="main-header">
                    <h1>Keyword & Keyphrase Intelligence</h1>
                    <p className="subtitle">Extract insights using TF-IDF and KeyBERT</p>
                </div>

                <div className="input-section">
                    <div className="textarea-wrapper">
                        <textarea
                            value={text}
                            onChange={e => setText(e.target.value)}
                            placeholder="Paste your article, document, or any text here for analysis..."
                            className="text-input"
                            disabled={!!file}
                        />
                        <div className="text-counter">
                            <span className={getCharCount(text) > MAX_TEXT_LENGTH ? 'counter-warning' : ''}>
                                {getCharCount(text).toLocaleString()} chars
                            </span>
                            <span className="counter-separator">•</span>
                            <span>{getWordCount(text).toLocaleString()} words</span>
                        </div>
                    </div>

                    <div className="action-bar">
                        <div className="file-upload-wrapper">
                            <input
                                type="file"
                                accept="application/pdf"
                                id="pdf-upload"
                                onChange={e => setFile(e.target.files[0])}
                                className="file-input"
                            />
                            <label htmlFor="pdf-upload" className="file-label">
                                {file ? (
                                    <span className="file-name-wrapper">
                                        <span className="file-name">{file.name}</span>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                removeFile();
                                            }}
                                            className="file-remove"
                                            title="Remove file"
                                        >
                                            &times;
                                        </button>
                                    </span>
                                ) : (
                                    'Choose PDF file'
                                )}
                            </label>
                        </div>

                        <div className="button-group">
                            <button onClick={clearForm} className="btn-clear" title="Clear all">
                                Clear
                            </button>
                            <button onClick={submit} disabled={loading || (!file && !text.trim())} className="btn-primary">
                                {loading ? 'Processing...' : 'Analyze'}
                            </button>
                            <button onClick={downloadCSV} disabled={!result} className="btn-secondary">
                                Export CSV
                            </button>
                        </div>
                    </div>
                </div>

                {loading && <LoadingSpinner />}

                {result && (
                    <section className="results fade-in">
                        <div className="card">
                            <div className="card-header">
                                <h3>Rule-Based Keywords</h3>
                                <div className="card-header-actions">
                                    <span className="badge">TF-IDF</span>
                                    <button
                                        onClick={() => copyToClipboard((result.rule_keywords || []).join(', '), 'Keywords')}
                                        className="btn-copy"
                                        title="Copy all keywords"
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>
                            <ul className="keyword-list">
                                {(result.rule_keywords || []).length > 0 ? (
                                    (result.rule_keywords || []).map((k, i) => (
                                        <li key={i} className="keyword-item">
                                            {k}
                                            <button
                                                onClick={() => copyToClipboard(k, 'Keyword')}
                                                className="keyword-copy"
                                                title="Copy keyword"
                                            >
                                                📋
                                            </button>
                                        </li>
                                    ))
                                ) : (
                                    <li className="empty-state">No keywords found</li>
                                )}
                            </ul>
                        </div>

                        <div className="card">
                            <div className="card-header">
                                <h3>ML-Based Keywords</h3>
                                <div className="card-header-actions">
                                    <span className="badge">KeyBERT</span>
                                    <button
                                        onClick={() => copyToClipboard((result.ml_keywords || []).join(', '), 'Keywords')}
                                        className="btn-copy"
                                        title="Copy all keywords"
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>
                            <ul className="keyword-list">
                                {(result.ml_keywords || []).length > 0 ? (
                                    (result.ml_keywords || []).map((k, i) => (
                                        <li key={i} className="keyword-item">
                                            {k}
                                            <button
                                                onClick={() => copyToClipboard(k, 'Keyword')}
                                                className="keyword-copy"
                                                title="Copy keyword"
                                            >
                                                📋
                                            </button>
                                        </li>
                                    ))
                                ) : (
                                    <li className="empty-state">No keywords found</li>
                                )}
                            </ul>
                        </div>

                        <div className="card">
                            <div className="card-header">
                                <h3>Key Phrases</h3>
                                <div className="card-header-actions">
                                    <span className="badge">spaCy</span>
                                    <button
                                        onClick={() => copyToClipboard((result.phrases || []).slice(0, 10).join(', '), 'Phrases')}
                                        className="btn-copy"
                                        title="Copy all phrases"
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>
                            <ul className="keyword-list">
                                {(result.phrases || []).length > 0 ? (
                                    (result.phrases || []).slice(0, 10).map((k, i) => (
                                        <li key={i} className="keyword-item">
                                            {k}
                                            <button
                                                onClick={() => copyToClipboard(k, 'Phrase')}
                                                className="keyword-copy"
                                                title="Copy phrase"
                                            >
                                                📋
                                            </button>
                                        </li>
                                    ))
                                ) : (
                                    <li className="empty-state">No phrases found</li>
                                )}
                            </ul>
                        </div>

                        <div className="card summary-card">
                            <div className="card-header">
                                <h3>Summary & Topic</h3>
                                <button
                                    onClick={() => copyToClipboard(result.summary || '', 'Summary')}
                                    className="btn-copy"
                                    title="Copy summary"
                                >
                                    Copy
                                </button>
                            </div>
                            <p className="summary-text">{result.summary || 'No summary available'}</p>
                            <div className="topic-badge">
                                <span className="topic-label">Topic:</span>
                                <span className="topic-value">{(result.topic || [])[0] || 'N/A'}</span>
                            </div>
                        </div>
                    </section>
                )}

                {!result && !loading && (
                    <div className="empty-results">
                        <p>Enter text or upload a PDF to analyze keywords and extract insights.</p>
                    </div>
                )}
            </main>
        </div>
    );
}
