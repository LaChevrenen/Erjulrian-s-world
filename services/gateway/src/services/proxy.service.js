export async function forward(req, res, target) {
    try {
        const bodyString = req.body ? JSON.stringify(req.body) : null;
        
        const headers = {
            'content-type': 'application/json'
        };
        if (req.headers.authorization) {
            headers.authorization = req.headers.authorization;
        }

        if (bodyString) {
            headers['content-length'] = Buffer.byteLength(bodyString);
        }

        // Use baseUrl + path to reconstruct the full path within the service
        let path = (req.baseUrl || '') + (req.path || '/');
        
        const queryString = req.url.split('?')[1] ? '?' + req.url.split('?')[1] : '';
        const fullUrl = `${target}${path}${queryString}`;
        console.log(`[PROXY] ${req.method} ${req.originalUrl} -> ${fullUrl}`);
        const response = await fetch(fullUrl, {
            method: req.method,
            headers: headers,
            body: bodyString || undefined
        });

        const contentType = response.headers.get('content-type');
        
        if (contentType?.includes('application/json')) {
            const data = await response.json();
            res.status(response.status).json(data);
        } else {
            const text = await response.text();
            res.status(response.status).send(text);
        }
    }
    catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({ error: error.message });
    }
}
