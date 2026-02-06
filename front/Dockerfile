FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose Vite dev server port
EXPOSE 5173

# Run Vite in dev mode with host flag for Docker
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
