const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
// Разрешаем подключения со всех адресов (чтобы Netlify мог достучаться)
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Хранилища данных
let queue = [];     // Очередь тех, кто ищет чат
let userRooms = {}; // Кто в какой комнате сидит

io.on('connection', (socket) => {
    console.log('Подключен агент:', socket.id);

    // Логика поиска собеседника
    socket.on('find_partner', (data) => {
        // Проверяем, нет ли уже этого игрока в очереди
        if (!queue.find(u => u.id === socket.id)) {
            queue.push({ id: socket.id, nick: data.nick });
        }

        console.log('В очереди человек:', queue.length);

        // Если набралось двое — соединяем
        if (queue.length >= 2) {
            const user1 = queue.shift();
            const user2 = queue.shift();

            const roomId = `room_${user1.id}_${user2.id}`;

            // Привязываем обоих к комнате
            userRooms[user1.id] = roomId;
            userRooms[user2.id] = roomId;

            // Заставляем их "зайти" в эту комнату в сокетах
            const s1 = io.sockets.sockets.get(user1.id);
            const s2 = io.sockets.sockets.get(user2.id);

            if (s1) s1.join(roomId);
            if (s2) s2.join(roomId);

            // Отправляем сигнал обоим, что чат начался
            io.to(user1.id).emit('chat_started', { partnerNick: user2.nick });
            io.to(user2.id).emit('chat_started', { partnerNick: user1.nick });
        }
    });

    // Пересылка сообщений
    socket.on('send_msg', (data) => {
        const roomId = userRooms[socket.id];
        if (roomId) {
            // Отправляем всем в комнате, кроме отправителя
            socket.to(roomId).emit('receive_msg', { text: data.text });
        }
    });

    // Остановка поиска
    socket.on('stop_search', () => {
        queue = queue.filter(u => u.id !== socket.id);
    });

    // Выход из чата или дисконнект
    const disconnectUser = () => {
        queue = queue.filter(u => u.id !== socket.id);
        const roomId = userRooms[socket.id];
        if (roomId) {
            socket.to(roomId).emit('partner_left');
            delete userRooms[socket.id];
        }
    };

    socket.on('leave_chat', disconnectUser);
    socket.on('disconnect', disconnectUser);
});

// Запуск на порту, который выдаст Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Ядро Ink Corp запущено на порту ${PORT}`);
});
