FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY user.yml ./
RUN npm install --production

COPY . .

EXPOSE 3003

CMD ["node", "server.js"]
