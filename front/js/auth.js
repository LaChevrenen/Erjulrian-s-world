function isAuthenticated() {
    const token = localStorage.getItem('token');
    return !!(token);
}

function requireAuth() {
  if (!isAuthenticated()) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

function logout() {
  localStorage.clear();
  window.location.href = 'index.html';
}

function redirectIfAuthenticated() {
  if (isAuthenticated()) {
    window.location.href = 'heroes.html';
  }
}

async function login(username) {
    try {
        const payload = {name: username};
        const data = await api.post('/user/connect', payload);
        localStorage.setItem('token', data.token);
        localStorage.setItem('userId', data.userId);
        window.location.href = 'heroes.html';
    } catch(error) {
        console.error(error);
        if(error.statusCode === 404) {
            alert(`L'utilisateur ${username} n'existe pas.`);
        }
    }
}

async function register(username) {
    try {
        const payload = {name: username, isAdmin: false};
        const user = await api.post('/user', payload);
        alert(`L'utilisateur ${user.name} a été créé. Vous pouvez vous authentifier avec.`);
    } catch(error) {
        console.error(error);
        console.log(JSON.stringify(error));
    }
}