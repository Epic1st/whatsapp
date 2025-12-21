FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

# Initialize sqlite file
RUN touch database.sqlite

EXPOSE 3000

CMD ["node", "server.js"]
