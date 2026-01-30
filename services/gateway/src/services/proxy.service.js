export async function forward(req, res, target) {
    try {
        // Append the target we forward to, to the original route
        const response = await fetch(`${target}${req.originalUrl}`, {
            method: req.method,
            headers: {
                ...req.headers,
                host: undefined
            },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();
        res.status(response.status).send(data);
    }
    catch (error) {
        res.status(500).send(error);
    }
}