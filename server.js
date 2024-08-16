const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["*"],
    credentials: true
  }
});

app.get('/ping', (req, res) => {
  res.send('Pong!');
});


io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    console.error('Authentication error: Token not provided');
    return next(new Error('Authentication error: Token not provided'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.sub;
    socket.userEmail = decoded.email; //add a user boards to autorize based on rooms id
    console.log(`User connected: ${socket.userId}`);
    next();
  } catch (error) {
    console.error(error);
    return next(new Error('Authentication error: Invalid token'));
  }
});

const rooms = new Map();

io.on('connection', (socket) => {
  const roomId = socket.handshake.query.roomId;
  
  socket.join(roomId);
  
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  
  const room = rooms.get(roomId);
  room.add(socket);

  socket.on('register', (userId, connectionId, name, picture) => {
    socket.userId = userId;
    socket.connectionId = connectionId;
    socket.userName = name;
    socket.userPicture = picture;

    const users = Array.from(room).map(clientSocket => ({
      userId: clientSocket.userId,
      connectionId: clientSocket.connectionId,
      presence: null,
      information: {
        name: clientSocket.userName,
        picture: clientSocket.userPicture
      }
    }));

    io.to(roomId).emit('users', users);
  });

  socket.on('layer-update', (updatedLayerIds, updatedLayers) => {
    socket.to(roomId).emit('layer-update', updatedLayerIds, updatedLayers);
  });

  socket.on('presence', (newPresence, userId) => {
    socket.presence = newPresence;
    const users = Array.from(room).map(clientSocket => ({
      userId: clientSocket.userId,
      connectionId: clientSocket.connectionId,
      presence: clientSocket.presence,
      information: {
        name: clientSocket.userName,
        picture: clientSocket.userPicture
      }
    }));
    socket.to(roomId).emit('users', users);
  });

  socket.on('layer-send', (arr) => {
    socket.to(roomId).emit('layer-send', arr);
  });

  socket.on('layer-delete', (layerIds) => {
    socket.to(roomId).emit('layer-delete', layerIds);
  });

  socket.on('disconnect', () => {
    room.delete(socket);
    if (room.size === 0) {
      rooms.delete(roomId);
    } else {
      const users = Array.from(room).map(clientSocket => ({
        userId: clientSocket.userId,
        connectionId: clientSocket.connectionId,
        presence: clientSocket.presence,
        information: {
          name: clientSocket.userName,
          picture: clientSocket.userPicture
        }
      }));
      io.to(roomId).emit('users', users);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
