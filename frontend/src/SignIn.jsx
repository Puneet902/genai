import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function SignIn() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const { login, isAuthenticated } = useAuth();

    // Redirect if already authenticated
    useEffect(() => {
        if (isAuthenticated) {
            navigate('/', { replace: true });
        }
    }, [isAuthenticated, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        // Basic validation
        if (!email || !password) {
            setError('Please enter both email and password');
            return;
        }

        if (!email.includes('@')) {
            setError('Please enter a valid email address');
            return;
        }

        if (password.length < 4) {
            setError('Password must be at least 4 characters');
            return;
        }

        setIsLoading(true);

        // Simulate network delay for better UX
        setTimeout(() => {
            const success = login(email, password);
            setIsLoading(false);

            if (success) {
                navigate('/', { replace: true });
            } else {
                setError('Invalid credentials');
            }
        }, 800);
    };

    return (
        <div className="signin-container">
            <div className="signin-background">
                <div className="gradient-orb orb-1"></div>
                <div className="gradient-orb orb-2"></div>
                <div className="gradient-orb orb-3"></div>
            </div>

            <div className="signin-content">
                <div className="signin-card">
                    <div className="signin-header">
                        <h1 className="signin-title">Keyword Intelligence</h1>
                        <p className="signin-subtitle">Sign in to continue your analysis</p>
                    </div>

                    <form onSubmit={handleSubmit} className="signin-form">
                        {error && (
                            <div className="signin-error">
                                {error}
                            </div>
                        )}

                        <div className="form-group">
                            <label htmlFor="email">Email Address</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                className="form-input"
                                disabled={isLoading}
                                autoComplete="email"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="password">Password</label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your password"
                                className="form-input"
                                disabled={isLoading}
                                autoComplete="current-password"
                            />
                        </div>

                        <div className="form-checkbox">
                            <label className="checkbox-container">
                                <input
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    disabled={isLoading}
                                />
                                <span className="checkmark"></span>
                                <span className="checkbox-text">Remember me</span>
                            </label>
                        </div>

                        <button
                            type="submit"
                            className="signin-button"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <span className="button-loading">
                                    <span className="button-spinner"></span>
                                    Signing in...
                                </span>
                            ) : (
                                'Sign In'
                            )}
                        </button>
                    </form>

                    <div className="signin-footer">
                        <p className="demo-note">
                            Demo Mode: Use any email and password (min 4 chars)
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
