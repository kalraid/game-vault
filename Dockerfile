FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ENV DATABASE_URL=file:./dev.db
RUN npm run prisma:generate
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3001
ENV CLIENT_ORIGIN=http://localhost:5175
ENV DATABASE_URL=file:/data/dev.db

COPY package.json package-lock.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/README.md ./README.md
COPY --from=build /app/TODO.md ./TODO.md
COPY --from=build /app/0034-godot-to-web-pivot.md ./0034-godot-to-web-pivot.md

EXPOSE 3001

CMD ["sh", "-c", "npm run db:init && npm run start"]
