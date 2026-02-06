import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Login.css';

interface FormData {
  username: string;
}

export default function Login(): React.ReactElement {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [formData, setFormData] = useState<FormData>({
    username: '',
  });

  useEffect(() => {
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const { name, value } = e.currentTarget;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let endpoint: string;
      let payload: Record<string, unknown>;

      if (isLogin) {
        endpoint = 'http://localhost:3000/user/connect';
        payload = { name: formData.username };
      } else {
        endpoint = 'http://localhost:3000/user';
        payload = { name: formData.username, isAdmin: false };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Erreur ${response.status}`);
      }

      const data: any = await response.json();

      const token = data.token;
      const userId = data.userId || data.id;
      
      if (token && userId) {
        localStorage.setItem('token', token);
        localStorage.setItem('userId', userId);
        navigate('/menu', { replace: true });
      } else {
        setError('Erreur: réponse invalide du serveur');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur de connexion au serveur';
      setError(isLogin 
        ? 'Impossible de se connecter avec cet utilisateur'
        : 'Cet utilisateur existe déjà ou erreur d\'inscription'
      );
      console.error('Auth error:', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-background-overlay"></div>
      
      <div className="login-container">
        <div className="header-section">
          <h1 className="game-title">Erjulrian's World</h1>
          <p className="game-subtitle">L'Épopée des Héros</p>
        </div>

        <div className="auth-card">
          <div className="tab-navigation">
            <button
              className={`tab-button ${isLogin ? 'active' : ''}`}
              onClick={() => {
                setIsLogin(true);
                setError('');
                setFormData({ username: '' });
              }}
            >
              Connexion
            </button>
            <button
              className={`tab-button ${!isLogin ? 'active' : ''}`}
              onClick={() => {
                setIsLogin(false);
                setError('');
                setFormData({ username: '' });
              }}
            >
              Inscription
            </button>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="username" className="form-label">
                Nom d'utilisateur
              </label>
              <div className="input-wrapper">
                <input
                  id="username"
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  placeholder="Nom d'utilisateur"
                  required
                  className="form-input"
                  disabled={loading}
                />
                <span className="input-icon">👤</span>
              </div>
            </div>

            {error && (
              <div className="error-message">
                <span className="error-icon">⚠️</span>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="submit-button"
              disabled={loading}
            >
              {isLogin ? 'Se connecter' : "S'inscrire"}
            </button>
          </form>

          <div className="auth-footer">
            <p className="footer-text">
              {isLogin 
                ? "Pas encore de compte ? Créez-en un pour commencer votre aventure !"
                : "Déjà membre ? Connectez-vous pour reprendre votre quête !"}
            </p>
          </div>
        </div>

        <div className="decoration decoration-left">✦</div>
        <div className="decoration decoration-right">✦</div>
      </div>

      <div className="particles">
        {[...Array(20)].map((_, i) => (
          <div key={i} className="particle"></div>
        ))}
      </div>
    </div>
  );
}
