import { Socket } from 'socket.io';

interface ConnectionData {
	socket: Socket;
	clientId: string;
	entities?: Map<string, string>; // Map of entityType -> entityId
}

class ConnectionManager {
	private connections: Map<string, ConnectionData> = new Map();
	private clientConnections: Map<string, Set<string>> = new Map();
	private entityConnections: Map<string, Map<string, Set<string>>> = new Map(); // entityType -> entityId -> socketIds

	addConnection(socket: Socket, clientId: string, entities?: Record<string, string>): void {
		const connectionData: ConnectionData = {
			socket,
			clientId,
			entities: entities ? new Map(Object.entries(entities)) : undefined,
		};

		this.connections.set(socket.id, connectionData);

		// Track client connections
		if (!this.clientConnections.has(clientId)) {
			this.clientConnections.set(clientId, new Set());
		}
		this.clientConnections.get(clientId)!.add(socket.id);

		if (entities) {
			Object.entries(entities).forEach(([entityType, entityId]) => {
				if (!entityId) return;

				if (!this.entityConnections.has(entityType)) {
					this.entityConnections.set(entityType, new Map());
				}

				const entityTypeMap = this.entityConnections.get(entityType)!;
				if (!entityTypeMap.has(entityId)) {
					entityTypeMap.set(entityId, new Set());
				}

				entityTypeMap.get(entityId)!.add(socket.id);
			});
		}

		socket.on('disconnect', () => this.removeConnection(socket));
	}

	removeConnection(socket: Socket): void {
		const connection = this.connections.get(socket.id);
		if (!connection) return;

		this.connections.delete(socket.id);

		const clientSockets = this.clientConnections.get(connection.clientId);
		if (clientSockets) {
			clientSockets.delete(socket.id);
			if (clientSockets.size === 0) {
				this.clientConnections.delete(connection.clientId);
			}
		}

		if (connection.entities) {
			connection.entities.forEach((entityId, entityType) => {
				const entityTypeMap = this.entityConnections.get(entityType);
				if (entityTypeMap) {
					const entitySockets = entityTypeMap.get(entityId);
					if (entitySockets) {
						entitySockets.delete(socket.id);
						if (entitySockets.size === 0) {
							entityTypeMap.delete(entityId);

							if (entityTypeMap.size === 0) {
								this.entityConnections.delete(entityType);
							}
						}
					}
				}
			});
		}
	}

	getConnections(): Map<string, ConnectionData> {
		return this.connections;
	}

	getConnectionBySocketId(socketId: string): ConnectionData | undefined {
		return this.connections.get(socketId);
	}

	getConnectionsByClientId(clientId: string): Socket[] {
		const socketIds = this.clientConnections.get(clientId);
		if (!socketIds) return [];
		return Array.from(socketIds).map((socketId) => this.connections.get(socketId)!.socket);
	}

	getConnectionsByEntity(entityType: string, entityId: string): Socket[] {
		const entityTypeMap = this.entityConnections.get(entityType);
		if (!entityTypeMap) return [];

		const socketIds = entityTypeMap.get(entityId);
		if (!socketIds) return [];

		return Array.from(socketIds).map((socketId) => this.connections.get(socketId)!.socket);
	}

	emitToClientId(clientId: string, event: string, message: any): boolean {
		const sockets = this.getConnectionsByClientId(clientId);
		if (sockets.length > 0) {
			sockets.forEach((socket) => socket.emit(event, message));
			return true;
		}
		return false;
	}

	emitToEntity(entityType: string, entityId: string, event: string, message: any): boolean {
		const sockets = this.getConnectionsByEntity(entityType, entityId);
		if (sockets.length > 0) {
			sockets.forEach((socket) => socket.emit(event, message));
			return true;
		}
		return false;
	}
}

export default ConnectionManager;
