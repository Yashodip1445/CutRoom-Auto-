FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core fonts-noto-core python3-venv ca-certificates && rm -rf /var/lib/apt/lists/* && python3 -m venv /opt/video && /opt/video/bin/pip install "yt-dlp[default]"
ENV PATH="/opt/video/bin:${PATH}"
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build
CMD ["npm","start"]
