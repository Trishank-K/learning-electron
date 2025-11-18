const { WebSocketServer } = require('ws');
const { BrowserWindow } = require('electron');
const crypto = require('crypto');

function uuidv4() {
    return crypto.randomUUID();
}

const clients = new Map();

// Store sessions for reconnection
// sessions: Map<uid, { role, pairedWith, lastSeen, clientId }>
const sessions = new Map();

// Session expiry time (30 minutes)
const SESSION_EXPIRY = 30 * 60 * 1000;

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

function initializeWebSocketServer(port = 8080, host = '0.0.0.0') {
    if (wss) {
        console.log('WebSocket server already running');
        return wss;
    }

    wss = new WebSocketServer({ 
        port,
        host // Listen on all network interfaces for remote connections
    });

    console.log(`WebSocket server started on ${host}:${port}`);

    wss.on('connection', ws => {
        const clientId = uuidv4();

        console.log(`New client connected: ${clientId}`);

        clients.set(clientId, {
            ws,
            uid: null,
            role: null,
            pairedWith: null,
            pendingUIDAssignment: true
        });

        ws.send(
            JSON.stringify({
                type: 'connection-ready',
                clientId,
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

    console.log('Received message:', message.type, 'from', client.uid || 'pending', client.role || 'unknown role');

    switch (message.type) {
        case 'reconnect':
            handleReconnect(clientId, message.uid, message.role, message.pairWithUID);
            break;

        case 'new-connection':
            handleNewConnection(clientId);
            break;

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

function handleReconnect(clientId, oldUID, role, pairWithUID) {
    const client = clients.get(clientId);
    if (!client) return;

    const session = sessions.get(oldUID);
    const now = Date.now();

    if (session && (now - session.lastSeen < SESSION_EXPIRY)) {
        console.log(`Reconnecting ${oldUID} (${role})`);
        
        client.uid = oldUID;
        client.role = role;
        client.pairedWith = session.pairedWith;
        client.pendingUIDAssignment = false;

        session.lastSeen = now;
        session.clientId = clientId;

        client.ws.send(JSON.stringify({
            type: 'reconnected',
            uid: oldUID,
            role: role,
            pairedWith: session.pairedWith
        }));

        if (session.pairedWith) {
            const partner = Array.from(clients.values()).find(
                c => c.uid === session.pairedWith
            );
            if (partner) {
                partner.ws.send(JSON.stringify({
                    type: 'partner-reconnected',
                    partnerUID: oldUID
                }));
                console.log(`Notified ${session.pairedWith} that ${oldUID} reconnected`);
            }
        }
    } else {
        console.log(`Session expired or not found for ${oldUID}, assigning new UID`);
        handleNewConnection(clientId);
    }
}

function handleNewConnection(clientId) {
    const client = clients.get(clientId);
    if (!client) return;

    const uid = generateUID();
    console.log(`Assigned new UID: ${uid}`);

    client.uid = uid;
    client.pendingUIDAssignment = false;

    sessions.set(uid, {
        role: null,
        pairedWith: null,
        lastSeen: Date.now(),
        clientId: clientId
    });

    client.ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        uid,
    }));
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

    const session = sessions.get(client.uid);
    if (session) {
        session.role = role;
        session.lastSeen = Date.now();
    }

    if (role === 'helper' && pairWithUID) {
        const askerClient = Array.from(clients.values()).find(c => c.uid === pairWithUID && c.role === 'asker');

        if (askerClient) {
            client.pairedWith = pairWithUID;
            askerClient.pairedWith = client.uid;

            const helperSession = sessions.get(client.uid);
            const askerSession = sessions.get(askerClient.uid);
            if (helperSession) {
                helperSession.pairedWith = pairWithUID;
                helperSession.lastSeen = Date.now();
            }
            if (askerSession) {
                askerSession.pairedWith = client.uid;
                askerSession.lastSeen = Date.now();
            }

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

    if (client.uid && sessions.has(client.uid)) {
        const session = sessions.get(client.uid);
        session.lastSeen = Date.now();
        console.log(`Session preserved for ${client.uid} (${SESSION_EXPIRY / 60000} min reconnection window)`);
    }

    if (client.pairedWith) {
        const pairedClient = Array.from(clients.values()).find(c => c.uid === client.pairedWith);

        if (pairedClient) {
            pairedClient.ws.send(
                JSON.stringify({
                    type: 'partner-disconnected',
                    canReconnect: true,
                    reconnectWindow: SESSION_EXPIRY / 1000
                })
            );
            console.log(`Notified ${pairedClient.uid} about partner disconnect (can reconnect)`);
        }
    }

    clients.delete(clientId);
}

function cleanupExpiredSessions() {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [uid, session] of sessions.entries()) {
        if (now - session.lastSeen > SESSION_EXPIRY) {
            sessions.delete(uid);
            expiredCount++;
        }
    }
    
    if (expiredCount > 0) {
        console.log(`Cleaned up ${expiredCount} expired session(s)`);
    }
}

// Clean up expired sessions periodically
setInterval(cleanupExpiredSessions, 5 * 60 * 1000);

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
