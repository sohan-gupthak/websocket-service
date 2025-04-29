import { WebSocket } from 'ws';

export enum MessageType {
	TYPE_A = 'TYPE_A',
	TYPE_B = 'TYPE_B',
	// Add more connection types as needed
}

export interface RequestBody {
	[key: string]: any; // Optional request body structure
}

export interface WebSocketContext extends WebSocket {
	id: string;
}
