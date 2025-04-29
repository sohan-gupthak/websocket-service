import { createServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import app, { MessageController, registerWebSocketController } from './apiServer';
import ConnectionManager from './connections/connectionManager';
import { handleType } from './handlers/typeHandler';
import { log } from './utils/logger';
import { MessageType, RequestBody } from './types';

class WebSocketServer implements MessageController {
	private httpServer;
	private io: SocketIOServer;
	private connectionManager: ConnectionManager;
	private readonly PORT = 3030;
	private readonly API_PORT = 3000;

	constructor() {
		this.httpServer = createServer(app);
		this.io = new SocketIOServer(this.httpServer, {
			cors: {
				origin: '*',
				allowedHeaders: ['client-id', 'Content-Type'],
				methods: ['GET', 'POST'],
				credentials: true,
			},
			path: '/socket',
			transports: ['websocket', 'polling'],
			pingInterval: 10000,
			pingTimeout: 5000,
			allowEIO3: true,
		});
		this.connectionManager = new ConnectionManager();

		registerWebSocketController(this);
	}

	public initialize(): void {
		this.setupSocketEvents();
		this.startServers();
	}

	private setupSocketEvents(): void {
		this.io.on('connect', (socket: Socket) => {
			log('New client connected');

			const clientId: string = socket.handshake.headers['client-id'] as string;
			socket.data = { id: clientId };

			socket.emit(
				'update',
				JSON.stringify({
					type: 'WELCOME',
					data: {
						message: 'Connected to Socket.IO server',
					},
				}),
			);

			socket.on('REGISTER', (data) => {
				try {
					const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
					const clientId = parsedData.clientId;

					const entities: Record<string, string> = {};

					// Support for generic entities
					if (parsedData.entities && typeof parsedData.entities === 'object') {
						Object.assign(entities, parsedData.entities);
					}

					if (clientId) {
						this.connectionManager.addConnection(socket, clientId, entities);

						// Log the registration with entity details
						const entityDetails = Object.entries(entities)
							.map(([type, id]) => `${type}: ${id}`)
							.join(', ');
						log(
							`Client registered with ID: ${clientId}${entityDetails ? ', Entities: ' + entityDetails : ''}`,
						);

						socket.emit(
							'update',
							JSON.stringify({
								type: 'REGISTER_CONFIRMATION',
								data: {
									clientId,
									message: 'Registration successful',
								},
							}),
						);
					}
				} catch (error) {
					log('Error processing REGISTER event: ' + error);
				}
			});

			socket.on('message', async (message: string) => {
				try {
					const { type, data }: { type: MessageType; data: RequestBody } = JSON.parse(message);
					const clientId: string = data.clientId;
					const res = await handleType(type, data);

					this.broadcastUpdate(JSON.stringify({ type, data: res }), clientId);
				} catch (error) {
					log('Error processing message: ' + error);
				}
			});

			socket.on('disconnect', () => {
				this.connectionManager.removeConnection(socket);
				log('Client disconnected');
			});
		});
	}

	private startServers(): void {
		this.httpServer.listen(this.PORT, () => {
			log(`WebSocket server is listening on http://localhost:${this.PORT}`);
		});

		const apiServer = createServer(app);
		apiServer.listen(this.API_PORT, () => {
			log(`REST API server is listening on http://localhost:${this.API_PORT}`);
		});
	}

	public broadcastUpdate(message: string, clientId?: string): void {
		try {
			if (clientId) {
				log(`Sending message to client ${clientId}`);
				const sent = this.connectionManager.emitToClientId(clientId, 'update', message);
				if (!sent) {
					log(`No clients found for client ID ${clientId}, message not delivered`);
				}
			} else {
				log('Broadcasting message to all clients');
				this.io.emit('update', message);
			}
		} catch (error) {
			log('Error broadcasting update: ' + error);
		}
	}

	/**
	 * Send a message to a specific entity
	 * @param entityType The type of entity (e.g., 'hop', 'user', 'device')
	 * @param entityId The ID of the entity to send the message to
	 * @param message The message content
	 * @param messageType The type of message to send
	 */
	public sendTargetedMessage(entityType: string, entityId: string, message: string, messageType: string): void {
		try {
			const messageData: any = {
				entityType,
				entityId,
				message,
			};

			if (entityType === 'hop') {
				messageData.hopId = entityId;
			}

			const targetMessage = {
				type: messageType,
				data: messageData,
			};

			const sent = this.connectionManager.emitToEntity(entityType, entityId, messageType, targetMessage.data);

			if (!sent) {
				log(`No clients found for ${entityType} ${entityId}, message not delivered`);
			}

			log(`Sent message to ${entityType} ${entityId}: ${message}`);
		} catch (error) {
			log(`Error sending message to ${entityType} ${entityId}: ${error}`);
		}
	}
}

const webSocketServer = new WebSocketServer();
webSocketServer.initialize();

export default webSocketServer;
