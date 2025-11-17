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
    initializeWebSocketServer(8080);
    console.log('WebSocket server initialized on port 8080');

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

    // Connect to WebSocket server as client
    ipcMain.handle('ws-connect', async (event, role, pairWithUID) => {
        try {
            if (wsClient && wsClient.readyState === WebSocket.OPEN) {
                return { success: false, error: 'Already connected' };
            }

            wsClient = new WebSocket('ws://localhost:8080');
            
            return new Promise((resolve) => {
                wsClient.on('open', () => {
                    console.log('WebSocket client connected');
                    
                    // Set up message handler
                    wsClient.on('message', (data) => {
                        try {
                            const message = JSON.parse(data.toString());
                            console.log('Received WebSocket message:', message.type);
                            
                            // Forward messages to renderer
                            if (message.type === 'connected') {
                                sendToRenderer('ws-connected', message);
                            } else if (message.type === 'role-set') {
                                sendToRenderer('ws-role-set', message);
                            } else if (message.type === 'paired') {
                                sendToRenderer('ws-paired', message);
                            } else if (message.type === 'answer-received') {
                                sendToRenderer('update-response', message.answer);
                            } else if (message.type === 'question-received') {
                                sendToRenderer('ws-question-received', message);
                            } else if (message.type === 'partner-disconnected') {
                                sendToRenderer('ws-partner-disconnected', {});
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
                        wsClient = null;
                    });

                    wsClient.on('error', (error) => {
                        console.error('WebSocket client error:', error);
                        sendToRenderer('ws-error', { error: error.message });
                    });

                    resolve({ success: true });
                });

                wsClient.on('error', (error) => {
                    console.error('WebSocket connection error:', error);
                    resolve({ success: false, error: error.message });
                });
            });
        } catch (error) {
            console.error('Error connecting to WebSocket:', error);
            return { success: false, error: error.message };
        }
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

    // Disconnect from WebSocket
    ipcMain.handle('ws-disconnect', async (event) => {
        try {
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
