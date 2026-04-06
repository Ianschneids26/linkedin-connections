FROM node:20

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

# Remove devDependencies after build
RUN npm prune --production

CMD ["node", "dist/index.js"]
