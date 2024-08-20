const express = require('express');
const http = require('http');
const { send } = require('process');
const WebSocket = require('ws');

const PORT_NUMBER = 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const activeNames = [];
const nameToClientInfo = {};
// const exampleClientInfo = {
//     socket: WebSocket,
//     buyInPrice: number,
//     bigBlindPrice: number
//     tableName: string | null,
// };
const tables = [];
// const exampleTable = {
//     tableName: string,
//     playerNames: string[],
//     buyInPrice: number,
//     bigBlindPrice: number
// };

function sendTablesList(toName) {
    const clientInfo = nameToClientInfo[toName];
    if (!clientInfo || !clientInfo.socket) {
        return;
    }
    
    const message = {
        type: "tablesList",
        data: tables
    };

    clientInfo.socket.send(JSON.stringify(message));
}

function handleClientDisconnect(name) {
    // todo - notify opponents if client has assigned tableName, update table, etc.
    delete nameToClientInfo[name];
    removeName(name);
}

function removeName(name) {
    const indexToRemove = activeNames.indexOf(name);
    if (indexToRemove >= 0) {
        activeNames.splice(indexToRemove, 1);
    }
}

wss.on('connection', (ws) => {
    console.log(`A new client connected.`);

    ws.on('message', (message) => {
        let objMessage;
        try {
            objMessage = JSON.parse(message.toString());
        } catch (error) {
            console.error('JSON parsing failed:', error);
        }
        
        if (!objMessage || !objMessage.type) {
            console.log('Invalid message structure.');
            return;
        }

        switch (objMessage.type) {
            case "initial":
                const { clientName, buyInPrice, bigBlindPrice } = objMessage.data;
                if (activeNames.includes(clientName)) {
                    ws.send(JSON.stringify({type: 'duplicate'}));
                    return;
                }

                activeNames.push(clientName);
                nameToClientInfo[clientName] = {
                    socket: ws,
                    buyInPrice: buyInPrice,
                    bigBlindPrice: bigBlindPrice,
                    tableName: null, // to be assigned after client joins a table
                };
                sendTablesList(clientName);

                console.log(`Client ${clientName} joins matchmaking.`);

            default:
                break;
        }
    });

    ws.on('close', (code, reason) => {
        for (let i = 0; i < activeNames.length; i++) {
            const name = activeNames[i];
            const clientInfo = nameToClientInfo[name];
            if (clientInfo && clientInfo.socket === ws) {
                console.log(`Client ${name} disconnected. Code: ${code}, Reason: ${reason}`);
                handleClientDisconnect(name);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || PORT_NUMBER;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

server.on('error', (err) => {
    console.error('Server error:', err);
});

wss.on('error', (err) => {
    console.error('WebSocket server error:', err);
});

const shutdown = (signal) => {
    console.log(`Received ${signal} - Shutting down server...`);
    wss.close(() => {
        console.log('WebSocket server closed');
        server.close(() => {
            console.log('HTTP server closed');
            process.exit(0);
        });
    });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection:', reason);
});