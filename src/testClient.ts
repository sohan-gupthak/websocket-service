import { io } from 'socket.io-client';

const serverUrl = 'http://localhost:3030';
const clientId = 'your-client-id';
const client = io(serverUrl, {
	transports: ['websocket'],
	extraHeaders: {
		'client-id': clientId,
	},
	path: '/socket',
});

client.on('connect', () => {
	console.log('Connected to Socket.IO server');
	const testMessage = JSON.stringify({ type: 'test', data: { payload: 'Hello, server!' } });
	client.send(testMessage);
	console.log('Sent:', testMessage);
});

client.on('update', (data) => {
	const message = JSON.parse(data);
	console.log('Received:', message);
});

client.on('disconnect', () => {
	console.log('Disconnected from Socket.IO server');
});

client.on('connect_error', (error) => {
	console.error('Socket.IO connection error:', error);
});
