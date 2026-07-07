# Setell-MCP — container image for MCP introspection and self-hosting.
#
# Glama (and any MCP catalog checker) builds this image, starts the server, and
# issues introspection requests (initialize, tools/list, resources/list,
# prompts/list). The server always registers its surface and connects — with or
# without credentials — so introspection works out of the box. Tool CALLS need a
# real key: run with `docker run -e SETELL_EXTENSION_KEY=setell_ext_... <image>`.

# ---- build stage ----------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime stage --------------------------------------------------------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist

ENTRYPOINT ["node", "dist/index.js"]
