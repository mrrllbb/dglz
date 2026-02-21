FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy app source
COPY . .

# Use environment port variable (CloudBase will set a port)
ENV PORT=8080
EXPOSE 8080

# Start the miniprogram-compatible server by default
CMD ["npm", "run", "start:miniprogram"]
