# Setell-MCP — container image for MCP introspection and self-hosting.
#
# Glama (and any MCP catalog checker) builds this image, starts the server, and
# issues introspection requests (initialize, tools/list, resources/list,
# prompts/list). SETELL_MCP_INTROSPECTION=1 lets the server enumerate its
# surface WITHOUT a key or a backend round-trip.
#
# To actually USE the tools, run with a real key:
#   docker run -e SETELL_EXTENSION_KEY=setell_ext_... setell-mcp
# (introspection mode is overridden the moment a key is present.)

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

# Enumerate the tool/resource/prompt surface without credentials. A real tool
# CALL still requires SETELL_EXTENSION_KEY (empty bearer → per-request 401).
ENV SETELL_MCP_INTROSPECTION=1

ENTRYPOINT ["node", "dist/index.js"]
