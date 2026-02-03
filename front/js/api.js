class CustomError extends Error
{
    constructor(msg, statusCode) {
        super(msg);
        this.statusCode = statusCode;
    }
}

const API_URL = 'http://localhost:3000';

// Fonction helper pour faire des requêtes
async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    },
    ...options
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, config);
    
    if(config.method === "DELETE" || response === 204) {
      if(!response.ok) {
        throw new CustomError(`Erreur ${response.status}: ${response.statusText}`, response.status);
      }
      return {success: true};
    }

    if (!response.ok) {
      throw new CustomError(`Erreur ${response.status}: ${response.statusText}`, response.status);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Erreur API:', error);
    throw error;
  }
}

// Méthodes GET, POST, PUT, DELETE
const api = {
  get: (endpoint) => apiRequest(endpoint, { method: 'GET' }),
  post: (endpoint, data) => apiRequest(endpoint, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  
  put: (endpoint, data) => apiRequest(endpoint, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  
  delete: (endpoint) => apiRequest(endpoint, { method: 'DELETE' })
};