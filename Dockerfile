FROM ubuntu:24.04

COPY package.json .
COPY package-lock.json .

RUN npm install

COPY . .

CMD ["npx", "tsx", "index.ts"]
