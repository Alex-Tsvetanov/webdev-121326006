# The web app as one image. Build:  docker build -t lab-reservations .
# Run (settings come from the host, never from the image):  docker run --env-file .env -p 3000:3000 lab-reservations
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public
COPY migrations ./migrations

# Run as the unprivileged user that the official image provides, not root.
USER node
EXPOSE 3000
CMD ["node", "src/main.js"]
