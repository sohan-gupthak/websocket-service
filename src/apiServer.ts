import express, { Express, Request, Response } from 'express';
import bodyParser from 'body-parser';
import { log } from './utils/logger';
import cors from 'cors';

export interface MessageController {
	broadcastUpdate(message: string, clientId?: string): void;
	sendTargetedMessage(entityType: string, entityId: string, message: string, messageType: string): void;
}

const messageStore: Map<string, Map<string, { message: string; timestamp: number; source: 'websocket' }>> = new Map();

let webSocketController: MessageController;

export function registerWebSocketController(controller: MessageController) {
	webSocketController = controller;
	log('WebSocket controller registered');
}

function storeMessage(entityType: string, entityId: string, message: string, source: 'websocket' = 'websocket'): void {
	if (!messageStore.has(entityType)) {
		messageStore.set(entityType, new Map());
	}

	const entityMap = messageStore.get(entityType)!;
	entityMap.set(entityId, {
		message,
		timestamp: Date.now(),
		source,
	});
	log(`Stored ${source} message for ${entityType} ${entityId}: ${message}`);
}

function getLatestMessage(entityType: string, entityId: string, source?: 'websocket' | 'sse'): string | null {
	const entityMap = messageStore.get(entityType);
	if (!entityMap) return null;

	const entry = entityMap.get(entityId);
	if (entry && (source === undefined || entry.source === source)) {
		return entry.message;
	}
	return null;
}

const app: Express = express();

app.use(cors());
app.use(bodyParser.json());

app.post('/update', (req: Request, res: Response) => {
	try {
		const { message, clientId, type, entityType, entityId } = req.body;

		if (!message) {
			res.status(400).send('Message is required');
			return;
		}

		if (!webSocketController) {
			res.status(503).send({ success: false, error: 'WebSocket controller not registered' });
			return;
		}

		if (type && entityType && entityId) {
			storeMessage(entityType, entityId, message, 'websocket');
			webSocketController.sendTargetedMessage(entityType, entityId, message, type);
			res.status(200).send({ success: true, message: `Message sent to ${entityType}` });
		} else {
			const messageObj = typeof message === 'string' ? { message } : message;
			webSocketController.broadcastUpdate(JSON.stringify(messageObj), clientId);
			res.status(200).send({ success: true, message: 'Message broadcast' });
		}
	} catch (error) {
		log(`Error in /update: ${error}`);
		res.status(500).send({ success: false, error: 'Internal server error' });
	}
});

// Get latest message for a specific entity
app.get('/message', (req: Request, res: Response) => {
	try {
		const { entityType, entityId, source } = req.query;

		if (!entityType || !entityId) {
			res.status(400).send('Entity type and ID are required');
			return;
		}

		const message = getLatestMessage(
			entityType as string,
			entityId as string,
			source as 'websocket' | 'sse' | undefined,
		);

		if (message) {
			res.status(200).send({ message, source: source || 'any' });
		} else {
			res.status(404).send({ message: 'No message found for this entity' });
		}
	} catch (error) {
		log(`Error in /message: ${error}`);
		res.status(500).send({ success: false, error: 'Internal server error' });
	}
});

app.get('/health', (req: Request, res: Response) => {
	res.status(200).send({
		status: 'ok',
		websocket: !!webSocketController,
	});
});

export default app;
