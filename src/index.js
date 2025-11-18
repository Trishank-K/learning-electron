if (require('electron-squirrel-startup')) {
    process.exit(0);
}

const { app, BrowserWindow, shell, ipcMain } = require('electron');
const { createWindow, updateGlobalShortcuts } = require('./utils/window');
const { setupGeminiIpcHandlers, stopMacOSAudioCapture, sendToRenderer } = require('./utils/gemini');
const { initializeWebSocketServer, closeWebSocketServer, getServerStatus } = require('./utils/websocket');
const { initializeRandomProcessNames } = require('./utils/processRandomizer');
const { applyAntiAnalysisMeasures } = require('./utils/stealthFeatures');
const { getLocalConfig, writeConfig } = require('./config');

const geminiSessionRef = { current: null };
let mainWindow = null;
let wsClient = null; // WebSocket client connection

// Initialize random process names for stealth
const randomNames = initializeRandomProcessNames();

function createMainWindow() {
    mainWindow = createWindow(sendToRenderer, geminiSessionRef, randomNames);
    return mainWindow;
}

app.whenReady().then(async () => {
    // Apply anti-analysis measures with random delay
    await applyAntiAnalysisMeasures();

    // Initialize WebSocket server
    // Use environment variable for production or default to localhost
    const wsPort = process.env.WS_PORT || 8080;
    const wsHost = process.env.WS_HOST || '0.0.0.0';
    initializeWebSocketServer(wsPort, wsHost);
    console.log(`WebSocket server initialized on ${wsHost}:${wsPort}`);

    createMainWindow();
    setupGeminiIpcHandlers(geminiSessionRef);
    setupWebSocketIpcHandlers();
    setupGeneralIpcHandlers();
});

app.on('window-all-closed', () => {
    stopMacOSAudioCapture();
    closeWebSocketServer();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    stopMacOSAudioCapture();
    closeWebSocketServer();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

function setupWebSocketIpcHandlers() {
    const WebSocket = require('ws');
    
    // Reconnection state
    let reconnectAttempts = 0;
    let reconnectTimeout = null;
    let savedConnectionInfo = null;
    const MAX_RECONNECT_ATTEMPTS = 10;
    const BASE_RECONNECT_DELAY = 1000; // 1 second
    const MAX_RECONNECT_DELAY = 30000; // 30 seconds

    // Function to attempt reconnection with exponential backoff
    function attemptReconnect() {
        if (!savedConnectionInfo) {
            console.log('No saved connection info, cannot reconnect');
            return;
        }

        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.log('Max reconnect attempts reached');
            sendToRenderer('ws-reconnect-failed', { reason: 'Max attempts reached' });
            return;
        }

        const delay = Math.min(
            BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
            MAX_RECONNECT_DELAY
        );

        console.log(`Attempting reconnection in ${delay}ms (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
        sendToRenderer('ws-reconnecting', { attempt: reconnectAttempts + 1, delay });

        reconnectTimeout = setTimeout(async () => {
            reconnectAttempts++;
            const result = await connectToWebSocket(
                savedConnectionInfo.role,
                savedConnectionInfo.pairWithUID,
                savedConnectionInfo.serverUrl,
                savedConnectionInfo.uid
            );

            if (!result.success) {
                attemptReconnect();
            }
        }, delay);
    }

    // Core connection function
    async function connectToWebSocket(role, pairWithUID, customServerUrl, existingUID = null) {
        try {
            if (wsClient && wsClient.readyState === WebSocket.OPEN) {
                return { success: false, error: 'Already connected' };
            }

            // Priority: customServerUrl (from UI) > environment variable > localhost
            const wsServerUrl = customServerUrl || process.env.WS_SERVER_URL || 'ws://localhost:8080';
            console.log('Connecting to WebSocket server:', wsServerUrl);
            
            // Save connection info for reconnection
            savedConnectionInfo = {
                role,
                pairWithUID,
                serverUrl: wsServerUrl,
                uid: existingUID
            };

            wsClient = new WebSocket(wsServerUrl);
            
            return new Promise((resolve, reject) => {
                let connectionReadyReceived = false;
                let isResolved = false;

                // Set up message handler BEFORE open event
                wsClient.on('message', (data) => {
                        try {
                            const message = JSON.parse(data.toString());
                            console.log('Received WebSocket message:', message.type);
                            
                            // Handle connection-ready message
                            if (message.type === 'connection-ready' && !connectionReadyReceived) {
                                connectionReadyReceived = true;
                                
                                // Attempt to reconnect with existing UID or request new connection
                                if (existingUID) {
                                    console.log('Attempting to reconnect with UID:', existingUID);
                                    wsClient.send(JSON.stringify({
                                        type: 'reconnect',
                                        uid: existingUID,
                                        role,
                                        pairWithUID
                                    }));
                                } else {
                                    console.log('Requesting new connection');
                                    wsClient.send(JSON.stringify({
                                        type: 'new-connection'
                                    }));
                                }
                                return;
                            }
                            
                            // Forward messages to renderer
                            if (message.type === 'connected') {
                                savedConnectionInfo.uid = message.uid;
                                reconnectAttempts = 0; // Reset on successful connection
                                sendToRenderer('ws-connected', message);
                                
                                // Resolve promise on successful connection
                                if (!isResolved) {
                                    isResolved = true;
                                    resolve({ success: true });
                                }
                            } else if (message.type === 'reconnected') {
                                savedConnectionInfo.uid = message.uid;
                                reconnectAttempts = 0; // Reset on successful reconnection
                                console.log('Successfully reconnected with UID:', message.uid);
                                sendToRenderer('ws-reconnected', message);
                                
                                // Resolve promise on successful reconnection
                                if (!isResolved) {
                                    isResolved = true;
                                    resolve({ success: true });
                                }
                            } else if (message.type === 'role-set') {
                                sendToRenderer('ws-role-set', message);
                            } else if (message.type === 'paired') {
                                sendToRenderer('ws-paired', message);
                            } else if (message.type === 'answer-received') {
                                sendToRenderer('update-response', message.answer);
                            } else if (message.type === 'question-received') {
                                sendToRenderer('ws-question-received', message);
                            } else if (message.type === 'partner-disconnected') {
                                sendToRenderer('ws-partner-disconnected', message);
                            } else if (message.type === 'partner-reconnected') {
                                sendToRenderer('ws-partner-reconnected', message);
                            } else if (message.type === 'error') {
                                sendToRenderer('ws-error', message);
                            }
                        } catch (error) {
                            console.error('Error parsing WebSocket message:', error);
                        }
                    });

                wsClient.on('close', () => {
                    console.log('WebSocket client disconnected');
                    sendToRenderer('ws-disconnected', {});
                    const previousClient = wsClient;
                    wsClient = null;
                    
                    // Attempt automatic reconnection (only if not manually closed)
                    if (savedConnectionInfo && previousClient) {
                        console.log('Connection lost, attempting to reconnect...');
                        attemptReconnect();
                    }
                });

                wsClient.on('open', () => {
                    console.log('WebSocket client opened, waiting for connection-ready...');
                    // Don't resolve here - wait for 'connected' or 'reconnected' message
                });

                wsClient.on('error', (error) => {
                    console.error('WebSocket client error:', error);
                    sendToRenderer('ws-error', { error: error.message });
                    
                    // If error occurs before connection is established, reject the promise
                    if (!isResolved) {
                        isResolved = true;
                        wsClient = null;
                        resolve({ success: false, error: error.message });
                    }
                });
                
                // Timeout after 10 seconds if no response
                setTimeout(() => {
                    if (!isResolved) {
                        isResolved = true;
                        console.error('Connection timeout - no response from server');
                        if (wsClient) {
                            wsClient.close();
                            wsClient = null;
                        }
                        resolve({ success: false, error: 'Connection timeout' });
                    }
                }, 10000);
            });
        } catch (error) {
            console.error('Error connecting to WebSocket:', error);
            return { success: false, error: error.message };
        }
    }

    // Connect to WebSocket server as client
    ipcMain.handle('ws-connect', async (event, role, pairWithUID, customServerUrl) => {
        // Clear any existing reconnection attempts
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
        reconnectAttempts = 0;

        return await connectToWebSocket(role, pairWithUID, customServerUrl);
    });

    // Set role (asker or helper)
    ipcMain.handle('ws-set-role', async (event, role, pairWithUID) => {
        try {
            if (!wsClient || wsClient.readyState !== WebSocket.OPEN) {
                return { success: false, error: 'Not connected to WebSocket server' };
            }

            wsClient.send(JSON.stringify({
                type: 'set-role',
                role,
                pairWithUID: pairWithUID || null,
            }));

            return { success: true };
        } catch (error) {
            console.error('Error setting role:', error);
            return { success: false, error: error.message };
        }
    });

    // Send question (from asker)
    ipcMain.handle('ws-send-question', async (event, question) => {
        try {
            if (!wsClient || wsClient.readyState !== WebSocket.OPEN) {
                return { success: false, error: 'Not connected to WebSocket server' };
            }

            wsClient.send(JSON.stringify({
                type: 'send-question',
                question,
            }));

            return { success: true };
        } catch (error) {
            console.error('Error sending question:', error);
            return { success: false, error: error.message };
        }
    });

    // Send answer (from helper)
    ipcMain.handle('ws-send-answer', async (event, answer) => {
        try {
            if (!wsClient || wsClient.readyState !== WebSocket.OPEN) {
                return { success: false, error: 'Not connected to WebSocket server' };
            }

            wsClient.send(JSON.stringify({
                type: 'send-answer',
                answer,
            }));

            return { success: true };
        } catch (error) {
            console.error('Error sending answer:', error);
            return { success: false, error: error.message };
        }
    });

    // Manual reconnect
    ipcMain.handle('ws-reconnect', async (event) => {
        try {
            // Clear any existing reconnection timeout
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }
            
            if (!savedConnectionInfo) {
                return { success: false, error: 'No previous connection information' };
            }

            // Close existing connection if any
            if (wsClient) {
                wsClient.close();
                wsClient = null;
            }

            // Reset reconnect attempts for manual reconnection
            reconnectAttempts = 0;

            // Attempt to reconnect with saved info
            const result = await connectToWebSocket(
                savedConnectionInfo.role,
                savedConnectionInfo.pairWithUID,
                savedConnectionInfo.serverUrl,
                savedConnectionInfo.uid
            );

            return result;
        } catch (error) {
            console.error('Error during manual reconnect:', error);
            return { success: false, error: error.message };
        }
    });

    // Disconnect from WebSocket
    ipcMain.handle('ws-disconnect', async (event) => {
        try {
            // Clear reconnection attempts
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }
            savedConnectionInfo = null;
            reconnectAttempts = 0;

            if (wsClient) {
                wsClient.close();
                wsClient = null;
            }
            return { success: true };
        } catch (error) {
            console.error('Error disconnecting from WebSocket:', error);
            return { success: false, error: error.message };
        }
    });

    // Get server status
    ipcMain.handle('ws-get-status', async (event) => {
        try {
            const status = getServerStatus();
            return { success: true, status };
        } catch (error) {
            console.error('Error getting server status:', error);
            return { success: false, error: error.message };
        }
    });
}

function setupGeneralIpcHandlers() {
    // Config-related IPC handlers
    ipcMain.handle('set-onboarded', async (event) => {
        try {
            const config = getLocalConfig();
            config.onboarded = true;
            writeConfig(config);
            return { success: true, config };
        } catch (error) {
            console.error('Error setting onboarded:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('set-stealth-level', async (event, stealthLevel) => {
        try {
            const validLevels = ['visible', 'balanced', 'ultra'];
            if (!validLevels.includes(stealthLevel)) {
                throw new Error(`Invalid stealth level: ${stealthLevel}. Must be one of: ${validLevels.join(', ')}`);
            }
            
            const config = getLocalConfig();
            config.stealthLevel = stealthLevel;
            writeConfig(config);
            return { success: true, config };
        } catch (error) {
            console.error('Error setting stealth level:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('set-layout', async (event, layout) => {
        try {
            const validLayouts = ['normal', 'compact'];
            if (!validLayouts.includes(layout)) {
                throw new Error(`Invalid layout: ${layout}. Must be one of: ${validLayouts.join(', ')}`);
            }
            
            const config = getLocalConfig();
            config.layout = layout;
            writeConfig(config);
            return { success: true, config };
        } catch (error) {
            console.error('Error setting layout:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-config', async (event) => {
        try {
            const config = getLocalConfig();
            return { success: true, config };
        } catch (error) {
            console.error('Error getting config:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('quit-application', async event => {
        try {
            stopMacOSAudioCapture();
            app.quit();
            return { success: true };
        } catch (error) {
            console.error('Error quitting application:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('open-external', async (event, url) => {
        try {
            await shell.openExternal(url);
            return { success: true };
        } catch (error) {
            console.error('Error opening external URL:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.on('update-keybinds', (event, newKeybinds) => {
        if (mainWindow) {
            updateGlobalShortcuts(newKeybinds, mainWindow, sendToRenderer, geminiSessionRef);
        }
    });

    ipcMain.handle('update-content-protection', async (event, contentProtection) => {
        try {
            if (mainWindow) {

                // Get content protection setting from localStorage via cheddar
                const contentProtection = await mainWindow.webContents.executeJavaScript('cheddar.getContentProtection()');
                mainWindow.setContentProtection(contentProtection);
                console.log('Content protection updated:', contentProtection);
            }
            return { success: true };
        } catch (error) {
            console.error('Error updating content protection:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-random-display-name', async event => {
        try {
            return randomNames ? randomNames.displayName : 'System Monitor';
        } catch (error) {
            console.error('Error getting random display name:', error);
            return 'System Monitor';
        }
    });
}
