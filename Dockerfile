FROM node:24-alpine
WORKDIR /app
COPY package.json server.mjs schema.sql ./
COPY public ./public
RUN mkdir /data && chown node:node /data
ENV DATA_DIR=/data HOST=0.0.0.0 PORT=4173
USER node
EXPOSE 4173
CMD ["node", "server.mjs"]
