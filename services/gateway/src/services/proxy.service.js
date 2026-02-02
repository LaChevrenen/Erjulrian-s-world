export async function forward(req, res, target) {
    try {
        const bodyString = req.body ? JSON.stringify(req.body) : null;
        const headers = { ...req.headers, host: undefined };

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

        // ✅ FIX : Vérifiez content-type AVANT json()
        const contentType = response.headers.get('content-type');
        
        if (contentType?.includes('application/json')) {
            const data = await response.json();
            res.status(response.status).json(data);
        } else {
            // Forward RAW response (HTML, text, etc.)
            const text = await response.text();
            res.status(response.status).send(text);
        }
    }
    catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({ error: error.message });
    }
}
