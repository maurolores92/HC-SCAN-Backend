# =========================================================================
# Etapa 1: Compilación (Builder) con Node 24
# =========================================================================
FROM node:24-alpine AS builder

WORKDIR /usr/src/app

# Copiar manifiestos de dependencias
COPY package*.json ./

# Instalar todas las dependencias para compilar TypeScript y binarios nativos (bcrypt)
RUN npm install

# Copiar el código fuente completo
COPY . .

# Compilar la aplicación NestJS
RUN npm run build

# =========================================================================
# Etapa 2: Imagen de Producción Ligera y Segura con Node 24
# =========================================================================
FROM node:24-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Copiar manifiestos
COPY package*.json ./

# Instalar exclusivamente dependencias de producción
RUN npm install --omit=dev && npm cache clean --force

# Copiar la aplicación compilada desde la etapa de compilación
COPY --from=builder /usr/src/app/dist ./dist

# Crear directorio de uploads con permisos para el usuario 'node'
RUN mkdir -p uploads && chown -R node:node /usr/src/app/uploads

# Declarar volumen persistente para evitar pérdida de imágenes en uploads
VOLUME ["/usr/src/app/uploads"]

# Ejecutar con usuario no-root por seguridad
USER node

# Exponer el puerto del backend (5003)
EXPOSE 5003

# Comando de inicio
CMD ["node", "dist/main"]
