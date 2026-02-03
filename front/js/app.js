// Créer un utilisateur
async function createUser(event) {
    event.preventDefault();
  
    const formData = new FormData(event.target);
    const username = Object.fromEntries(formData)['name'];
    const data = {
        name: username,
        isAdmin: false
    };

  try {
    console.log(JSON.stringify(data));

    await api.post('/user', data);
    
    // Vider le formulaire
    event.target.reset();
    
    // Message de succès
    showMessage('Utilisateur créé !', 'success');
    
  } catch (error) {
    showMessage('Erreur lors de la création', 'error');
  }
}


// Afficher un message temporaire
function showMessage(message, type) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;
  messageDiv.textContent = message;
  document.body.appendChild(messageDiv);
  
  setTimeout(() => messageDiv.remove(), 3000);
}

// Au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
  
  // Écouter la soumission du formulaire
  const form = document.getElementById('user-form');
  form?.addEventListener('submit', createUser);
});