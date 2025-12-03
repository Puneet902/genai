import React, { useState } from 'react';
import { postExtract, postExtractPDF } from './api';

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

    const submit = async () => {
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
            } else if (text.trim()) {
                const data = await postExtract({ text, top_n: topN, ng_min: ngMin, ng_max: ngMax });
                setResult(data);
            }
        } catch (err) {
            console.error(err);
            alert('Error processing request. Make sure backend is running.');
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
    };

    return (
        <div className="app-root">
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
                            min="5"
                            max="20"
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
                    <textarea
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder="Paste your article, document, or any text here for analysis..."
                        className="text-input"
                    />

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
                                {file ? file.name : 'Choose PDF file'}
                            </label>
                        </div>

                        <div className="button-group">
                            <button onClick={submit} disabled={loading} className="btn-primary">
                                {loading ? 'Processing...' : 'Analyze'}
                            </button>
                            <button onClick={downloadCSV} disabled={!result} className="btn-secondary">
                                Export CSV
                            </button>
                        </div>
                    </div>
                </div>

                {result && (
                    <section className="results">
                        <div className="card">
                            <div className="card-header">
                                <h3>Rule-Based Keywords</h3>
                                <span className="badge">TF-IDF</span>
                            </div>
                            <ul className="keyword-list">
                                {(result.rule_keywords || []).map((k, i) => (
                                    <li key={i} className="keyword-item">{k}</li>
                                ))}
                            </ul>
                        </div>

                        <div className="card">
                            <div className="card-header">
                                <h3>ML-Based Keywords</h3>
                                <span className="badge">KeyBERT</span>
                            </div>
                            <ul className="keyword-list">
                                {(result.ml_keywords || []).map((k, i) => (
                                    <li key={i} className="keyword-item">{k}</li>
                                ))}
                            </ul>
                        </div>

                        <div className="card">
                            <div className="card-header">
                                <h3>Key Phrases</h3>
                                <span className="badge">spaCy</span>
                            </div>
                            <ul className="keyword-list">
                                {(result.phrases || []).slice(0, 10).map((k, i) => (
                                    <li key={i} className="keyword-item">{k}</li>
                                ))}
                            </ul>
                        </div>

                        <div className="card summary-card">
                            <div className="card-header">
                                <h3>Summary & Topic</h3>
                            </div>
                            <p className="summary-text">{result.summary}</p>
                            <div className="topic-badge">
                                <span className="topic-label">Topic:</span>
                                <span className="topic-value">{(result.topic || [])[0] || 'N/A'}</span>
                            </div>
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}