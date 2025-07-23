FROM node:20.12.2-alpine

WORKDIR /app

COPY . .

RUN npm install && npm run build

EXPOSE 4173

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0"]
