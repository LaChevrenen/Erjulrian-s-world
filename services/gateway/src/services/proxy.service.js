export async function forward(req, res, target) {
    try {
        // Gérer le cas où req.body est undefined (GET, DELETE, etc.)
        const bodyString = req.body ? JSON.stringify(req.body) : null;

        const headers = {
            ...req.headers,
            host: undefined
        };

        // Recalculer content-length seulement si on a un body
        if (bodyString) {
            headers['content-length'] = Buffer.byteLength(bodyString);
        } else {
            delete headers['content-length'];
        }

        const response = await fetch(`${target}${req.originalUrl}`, {
            method: req.method,
            headers: headers,
            body: bodyString || undefined
        });

        const data = await response.json();
        res.status(response.status).send(data);
    }
    catch (error) {
        console.error('Proxy error:', error);
        res.status(500).send({ error: error.message });
    }
}