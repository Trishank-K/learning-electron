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
    const uid = generateUID();
    
    console.log(`[${new Date().toISOString()}] New client connected: ${clientId}`);
    console.log(`  → Assigned UID: ${uid}`);

    // Store client info
    clients.set(clientId, {
        ws,
        uid,
        role: null,
        pairedWith: null,
        connectedAt: new Date()
    });

    // Send initial connection info
    ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        uid,
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
            console.log(`  → Unknown message type: ${message.type}`);
    }
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

    // If helper, try to pair with asker
    if (role === 'helper' && pairWithUID) {
        const askerClient = Array.from(clients.values()).find(
            c => c.uid === pairWithUID && c.role === 'asker'
        );

        if (askerClient) {
            // Create pairing
            client.pairedWith = pairWithUID;
            askerClient.pairedWith = client.uid;

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

function handleClientDisconnect(clientId) {
    const client = clients.get(clientId);
    if (!client) return;

    // Notify paired client if exists
    if (client.pairedWith) {
        const pairedClient = Array.from(clients.values()).find(
            c => c.uid === client.pairedWith
        );

        if (pairedClient) {
            pairedClient.ws.send(JSON.stringify({
                type: 'partner-disconnected',
            }));
            pairedClient.pairedWith = null;
            console.log(`  → Notified ${pairedClient.uid} about partner disconnect`);
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

// Log status every 5 minutes
setInterval(() => {
    if (clients.size > 0) {
        console.log(`\n[${new Date().toISOString()}] Periodic status check`);
        logServerStatus();
    }
}, 5 * 60 * 1000);
