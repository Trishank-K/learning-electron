#!/usr/bin/env node

/**
 * Standalone WebSocket Server
 * Runs without Electron - perfect for headless servers like Azure VM
 */

const { WebSocketServer } = require('ws');
const crypto = require('crypto');

// Configuration from environment variables
const WS_HOST = process.env.WS_HOST || '0.0.0.0';
const WS_PORT = parseInt(process.env.WS_PORT) || 8080;

// Store for connected clients
const clients = new Map();

// Store sessions for reconnection
// sessions: Map<uid, { role, pairedWith, lastSeen, clientId }>
const sessions = new Map();

// Session expiry time (30 minutes)
const SESSION_EXPIRY = 30 * 60 * 1000;

// Simple UUID v4 generator
function generateUUID() {
    return crypto.randomUUID();
}

// Generate a short 8-character UID
function generateUID() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Initialize WebSocket Server
console.log('==========================================');
console.log('Cheating Daddy - WebSocket Server');
console.log('==========================================');
console.log(`Starting WebSocket server on ${WS_HOST}:${WS_PORT}`);

const wss = new WebSocketServer({ 
    host: WS_HOST,
    port: WS_PORT 
});

wss.on('listening', () => {
    console.log(`✓ WebSocket server is running on ${WS_HOST}:${WS_PORT}`);
    console.log(`✓ Server is ready to accept connections`);
    console.log('==========================================\n');
});

wss.on('connection', (ws) => {
    const clientId = generateUUID();
    let uid = null;
    let isReconnection = false;
    
    console.log(`[${new Date().toISOString()}] New client connected: ${clientId}`);

    // Store client info temporarily (will update UID after reconnect message or assign new)
    clients.set(clientId, {
        ws,
        uid: null,
        role: null,
        pairedWith: null,
        connectedAt: new Date(),
        pendingUIDAssignment: true
    });

    // Send connection ready - client will respond with reconnect or new connection
    ws.send(JSON.stringify({
        type: 'connection-ready',
        clientId,
    }));

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            handleClientMessage(clientId, message);
        } catch (error) {
            console.error(`[${clientId}] Error parsing message:`, error);
            ws.send(JSON.stringify({
                type: 'error',
                error: 'Invalid message format',
            }));
        }
    });

    ws.on('close', () => {
        console.log(`[${new Date().toISOString()}] Client disconnected: ${clientId} (${uid})`);
        handleClientDisconnect(clientId);
        logServerStatus();
    });

    ws.on('error', (error) => {
        console.error(`[${clientId}] WebSocket error:`, error.message);
    });

    logServerStatus();
});

wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
});

function handleClientMessage(clientId, message) {
    const client = clients.get(clientId);
    if (!client) return;

    console.log(`[${new Date().toISOString()}] Message from ${client.uid} (${client.role || 'no role'}):`, message.type);

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

        case 'audio-stream':
            handleAudioStream(clientId, message.audioType, message.data);
            break;

        case 'start-audio':
            handleStartAudio(clientId, message.audioType);
            break;

        case 'stop-audio':
            handleStopAudio(clientId, message.audioType);
            break;

        default:
            console.log(`  → Unknown message type: ${message.type}`);
    }
}

function handleReconnect(clientId, oldUID, role, pairWithUID) {
    const client = clients.get(clientId);
    if (!client) return;

    // Check if session exists and is not expired
    const session = sessions.get(oldUID);
    const now = Date.now();

    if (session && (now - session.lastSeen < SESSION_EXPIRY)) {
        // Valid session - restore it
        console.log(`  → Reconnecting ${oldUID} (${role})`);
        
        client.uid = oldUID;
        client.role = role;
        client.pairedWith = session.pairedWith;
        client.pendingUIDAssignment = false;

        // Update session
        session.lastSeen = now;
        session.clientId = clientId;

        // Notify client of successful reconnection
        client.ws.send(JSON.stringify({
            type: 'reconnected',
            uid: oldUID,
            role: role,
            pairedWith: session.pairedWith
        }));

        // If paired, notify partner of reconnection
        if (session.pairedWith) {
            const partner = Array.from(clients.values()).find(
                c => c.uid === session.pairedWith
            );
            if (partner) {
                partner.ws.send(JSON.stringify({
                    type: 'partner-reconnected',
                    partnerUID: oldUID
                }));
                console.log(`  → Notified ${session.pairedWith} that ${oldUID} reconnected`);
            }
        }

        logServerStatus();
    } else {
        // Session expired or doesn't exist - assign new UID
        console.log(`  → Session expired or not found for ${oldUID}, assigning new UID`);
        handleNewConnection(clientId);
    }
}

function handleNewConnection(clientId) {
    const client = clients.get(clientId);
    if (!client) return;

    const uid = generateUID();
    console.log(`  → Assigned new UID: ${uid}`);

    client.uid = uid;
    client.pendingUIDAssignment = false;

    // Create new session
    sessions.set(uid, {
        role: null,
        pairedWith: null,
        lastSeen: Date.now(),
        clientId: clientId
    });

    // Send UID to client
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
        client.ws.send(JSON.stringify({
            type: 'error',
            error: 'Invalid role. Must be "asker" or "helper"',
        }));
        return;
    }

    client.role = role;
    console.log(`  → Client ${client.uid} set role to ${role}`);

    // Update session
    const session = sessions.get(client.uid);
    if (session) {
        session.role = role;
        session.lastSeen = Date.now();
    }

    // If helper, try to pair with asker
    if (role === 'helper' && pairWithUID) {
        const askerClient = Array.from(clients.values()).find(
            c => c.uid === pairWithUID && c.role === 'asker'
        );

        if (askerClient) {
            // Create pairing
            client.pairedWith = pairWithUID;
            askerClient.pairedWith = client.uid;

            // Update sessions
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

            // Notify both clients
            client.ws.send(JSON.stringify({
                type: 'paired',
                pairedWithUID: pairWithUID,
                role: 'helper',
            }));

            askerClient.ws.send(JSON.stringify({
                type: 'paired',
                pairedWithUID: client.uid,
                role: 'asker',
            }));

            console.log(`  → ✓ Paired helper ${client.uid} with asker ${pairWithUID}`);
        } else {
            client.ws.send(JSON.stringify({
                type: 'error',
                error: 'Asker with that UID not found',
            }));
            console.log(`  → ✗ Asker ${pairWithUID} not found`);
        }
    }

    // Confirm role set
    client.ws.send(JSON.stringify({
        type: 'role-set',
        role,
        uid: client.uid,
    }));

    logServerStatus();
}

function handleSendQuestion(clientId, question) {
    const client = clients.get(clientId);
    if (!client || client.role !== 'asker') {
        console.log(`  → ✗ Invalid question sender`);
        return;
    }

    // Find paired helper
    const helper = Array.from(clients.values()).find(
        c => c.uid === client.pairedWith && c.role === 'helper'
    );

    if (helper) {
        // Send question to helper
        helper.ws.send(JSON.stringify({
            type: 'question-received',
            question,
            from: client.uid,
        }));

        console.log(`  → ✓ Forwarded question from ${client.uid} to helper ${helper.uid}`);
    } else {
        client.ws.send(JSON.stringify({
            type: 'error',
            error: 'No helper paired',
        }));
        console.log(`  → ✗ No helper paired for asker ${client.uid}`);
    }
}

function handleSendAnswer(clientId, answer) {
    const client = clients.get(clientId);
    if (!client || client.role !== 'helper') {
        console.log(`  → ✗ Invalid answer sender`);
        return;
    }

    // Find paired asker
    const asker = Array.from(clients.values()).find(
        c => c.uid === client.pairedWith && c.role === 'asker'
    );

    if (asker) {
        // Send answer to asker
        asker.ws.send(JSON.stringify({
            type: 'answer-received',
            answer,
            from: client.uid,
        }));

        console.log(`  → ✓ Forwarded answer from ${client.uid} to asker ${asker.uid}`);
    } else {
        client.ws.send(JSON.stringify({
            type: 'error',
            error: 'No asker paired',
        }));
        console.log(`  → ✗ No asker paired for helper ${client.uid}`);
    }
}

function handleAudioStream(clientId, audioType, data) {
    const client = clients.get(clientId);
    if (!client) return;

    // Find paired partner
    const partner = Array.from(clients.values()).find(
        c => c.uid === client.pairedWith
    );

    if (partner) {
        // Forward audio stream to partner
        partner.ws.send(JSON.stringify({
            type: 'audio-received',
            audioType: audioType, // 'mic' or 'system'
            data: data,
            from: client.uid
        }));
    }
}

function handleStartAudio(clientId, audioType) {
    const client = clients.get(clientId);
    if (!client) return;

    console.log(`  → ${client.uid} started ${audioType} audio`);

    // Notify paired partner
    const partner = Array.from(clients.values()).find(
        c => c.uid === client.pairedWith
    );

    if (partner) {
        partner.ws.send(JSON.stringify({
            type: 'audio-started',
            audioType: audioType,
            from: client.uid
        }));
        console.log(`  → Notified ${partner.uid} that ${client.uid} started ${audioType} audio`);
    }
}

function handleStopAudio(clientId, audioType) {
    const client = clients.get(clientId);
    if (!client) return;

    console.log(`  → ${client.uid} stopped ${audioType} audio`);

    // Notify paired partner
    const partner = Array.from(clients.values()).find(
        c => c.uid === client.pairedWith
    );

    if (partner) {
        partner.ws.send(JSON.stringify({
            type: 'audio-stopped',
            audioType: audioType,
            from: client.uid
        }));
        console.log(`  → Notified ${partner.uid} that ${client.uid} stopped ${audioType} audio`);
    }
}

function handleClientDisconnect(clientId) {
    const client = clients.get(clientId);
    if (!client) return;

    // Update session last seen time (for reconnection window)
    if (client.uid && sessions.has(client.uid)) {
        const session = sessions.get(client.uid);
        session.lastSeen = Date.now();
        console.log(`  → Session preserved for ${client.uid} (${SESSION_EXPIRY / 60000} min reconnection window)`);
    }

    // Notify paired client if exists (but keep pairing intact for reconnection)
    if (client.pairedWith) {
        const pairedClient = Array.from(clients.values()).find(
            c => c.uid === client.pairedWith
        );

        if (pairedClient) {
            pairedClient.ws.send(JSON.stringify({
                type: 'partner-disconnected',
                canReconnect: true,
                reconnectWindow: SESSION_EXPIRY / 1000 // in seconds
            }));
            console.log(`  → Notified ${pairedClient.uid} about partner disconnect (can reconnect)`);
        }
    }

    clients.delete(clientId);
}

function logServerStatus() {
    const askers = Array.from(clients.values()).filter(c => c.role === 'asker');
    const helpers = Array.from(clients.values()).filter(c => c.role === 'helper');
    const unassigned = Array.from(clients.values()).filter(c => !c.role);
    
    console.log(`\n--- Server Status ---`);
    console.log(`Total connections: ${clients.size}`);
    console.log(`  Askers: ${askers.length}`);
    console.log(`  Helpers: ${helpers.length}`);
    console.log(`  Unassigned: ${unassigned.length}`);
    
    if (askers.length > 0) {
        console.log('\nAskers:');
        askers.forEach(a => {
            const status = a.pairedWith ? `paired with ${a.pairedWith}` : 'unpaired';
            console.log(`  - ${a.uid} (${status})`);
        });
    }
    
    if (helpers.length > 0) {
        console.log('\nHelpers:');
        helpers.forEach(h => {
            const status = h.pairedWith ? `paired with ${h.pairedWith}` : 'unpaired';
            console.log(`  - ${h.uid} (${status})`);
        });
    }
    console.log('--------------------\n');
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    wss.close(() => {
        console.log('WebSocket server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    wss.close(() => {
        console.log('WebSocket server closed');
        process.exit(0);
    });
});

// Clean up expired sessions every 5 minutes
setInterval(() => {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [uid, session] of sessions.entries()) {
        if (now - session.lastSeen > SESSION_EXPIRY) {
            sessions.delete(uid);
            expiredCount++;
        }
    }
    
    if (expiredCount > 0) {
        console.log(`\n[${new Date().toISOString()}] Cleaned up ${expiredCount} expired session(s)`);
    }
}, 5 * 60 * 1000);

// Log status every 5 minutes
setInterval(() => {
    if (clients.size > 0 || sessions.size > 0) {
        console.log(`\n[${new Date().toISOString()}] Periodic status check`);
        console.log(`Active sessions: ${sessions.size}`);
        logServerStatus();
    }
}, 5 * 60 * 1000);
