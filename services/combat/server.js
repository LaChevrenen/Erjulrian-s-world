const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/combat', (req, res) => {
    res.send('Combat service is running');
});

app.listen(PORT, () => {
    console.log(`Combat service is listening on port ${PORT}`);
});