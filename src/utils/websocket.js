const { WebSocketServer } = require('ws');
const { BrowserWindow } = require('electron');
const crypto = require('crypto');

function uuidv4() {
    return crypto.randomUUID();
}

const clients = new Map();

const sessions = new Map();

let wss = null;

function sendToRenderer(channel, data) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
        windows[0].webContents.send(channel, data);
    }
}

function generateUID() {
    return uuidv4().split('-')[0].toUpperCase();
}

function initializeWebSocketServer(port = 8080) {
    if (wss) {
        console.log('WebSocket server already running');
        return wss;
    }

    wss = new WebSocketServer({ port });

    console.log(`WebSocket server started on port ${port}`);

    wss.on('connection', ws => {
        const clientId = uuidv4();
        const uid = generateUID();

        console.log(`New client connected: ${clientId}`);

        clients.set(clientId, {
            ws,
            uid,
            role: null,
            pairedWith: null,
        });

        ws.send(
            JSON.stringify({
                type: 'connected',
                clientId,
                uid,
            })
        );

        ws.on('message', data => {
            try {
                const message = JSON.parse(data.toString());
                handleClientMessage(clientId, message);
            } catch (error) {
                console.error('Error parsing message:', error);
                ws.send(
                    JSON.stringify({
                        type: 'error',
                        error: 'Invalid message format',
                    })
                );
            }
        });

        ws.on('close', () => {
            console.log(`Client disconnected: ${clientId}`);
            handleClientDisconnect(clientId);
        });

        ws.on('error', error => {
            console.error('WebSocket error:', error);
        });
    });

    wss.on('error', error => {
        console.error('WebSocket server error:', error);
    });

    return wss;
}

function handleClientMessage(clientId, message) {
    const client = clients.get(clientId);
    if (!client) return;

    console.log('Received message:', message.type, 'from', client.role || 'unknown role');

    switch (message.type) {
        case 'set-role':
            handleSetRole(clientId, message.role, message.pairWithUID);
            break;

        case 'send-question':
            handleSendQuestion(clientId, message.question);
            break;

        case 'send-answer':
            handleSendAnswer(clientId, message.answer);
            break;

        case 'ping':
            client.ws.send(JSON.stringify({ type: 'pong' }));
            break;

        default:
            console.log('Unknown message type:', message.type);
    }
}

function handleSetRole(clientId, role, pairWithUID) {
    const client = clients.get(clientId);
    if (!client) return;

    if (role !== 'asker' && role !== 'helper') {
        client.ws.send(
            JSON.stringify({
                type: 'error',
                error: 'Invalid role. Must be "asker" or "helper"',
            })
        );
        return;
    }

    client.role = role;
    console.log(`Client ${clientId} set role to ${role}`);

    if (role === 'helper' && pairWithUID) {
        const askerClient = Array.from(clients.values()).find(c => c.uid === pairWithUID && c.role === 'asker');

        if (askerClient) {
            client.pairedWith = pairWithUID;
            askerClient.pairedWith = client.uid;

            client.ws.send(
                JSON.stringify({
                    type: 'paired',
                    pairedWithUID: pairWithUID,
                    role: 'helper',
                })
            );

            askerClient.ws.send(
                JSON.stringify({
                    type: 'paired',
                    pairedWithUID: client.uid,
                    role: 'asker',
                })
            );

            console.log(`Paired helper ${client.uid} with asker ${pairWithUID}`);
        } else {
            client.ws.send(
                JSON.stringify({
                    type: 'error',
                    error: 'Asker with that UID not found',
                })
            );
        }
    }

    client.ws.send(
        JSON.stringify({
            type: 'role-set',
            role,
            uid: client.uid,
        })
    );

    sendToRenderer('ws-role-set', { role, uid: client.uid });
}

function handleSendQuestion(clientId, question) {
    const client = clients.get(clientId);
    if (!client || client.role !== 'asker') {
        console.log('Invalid question sender');
        return;
    }

    const helper = Array.from(clients.values()).find(c => c.uid === client.pairedWith && c.role === 'helper');

    if (helper) {
        helper.ws.send(
            JSON.stringify({
                type: 'question-received',
                question,
                from: client.uid,
            })
        );

        console.log(`Forwarded question from ${client.uid} to helper ${helper.uid}`);
    } else {
        client.ws.send(
            JSON.stringify({
                type: 'error',
                error: 'No helper paired',
            })
        );
    }
}

function handleSendAnswer(clientId, answer) {
    const client = clients.get(clientId);
    if (!client || client.role !== 'helper') {
        console.log('Invalid answer sender');
        return;
    }

    const asker = Array.from(clients.values()).find(c => c.uid === client.pairedWith && c.role === 'asker');

    if (asker) {
        asker.ws.send(
            JSON.stringify({
                type: 'answer-received',
                answer,
                from: client.uid,
            })
        );

        console.log(`Forwarded answer from ${client.uid} to asker ${asker.uid}`);

        sendToRenderer('update-response', answer);
    } else {
        client.ws.send(
            JSON.stringify({
                type: 'error',
                error: 'No asker paired',
            })
        );
    }
}

function handleClientDisconnect(clientId) {
    const client = clients.get(clientId);
    if (!client) return;

    if (client.pairedWith) {
        const pairedClient = Array.from(clients.values()).find(c => c.uid === client.pairedWith);

        if (pairedClient) {
            pairedClient.ws.send(
                JSON.stringify({
                    type: 'partner-disconnected',
                })
            );
            pairedClient.pairedWith = null;
        }
    }

    clients.delete(clientId);
}

function closeWebSocketServer() {
    if (wss) {
        clients.forEach(client => {
            client.ws.close();
        });
        clients.clear();
        sessions.clear();

        wss.close(() => {
            console.log('WebSocket server closed');
        });
        wss = null;
    }
}

function getServerStatus() {
    return {
        running: wss !== null,
        clientCount: clients.size,
        clients: Array.from(clients.values()).map(c => ({
            uid: c.uid,
            role: c.role,
            pairedWith: c.pairedWith,
        })),
    };
}

module.exports = {
    initializeWebSocketServer,
    closeWebSocketServer,
    getServerStatus,
    generateUID,
};
