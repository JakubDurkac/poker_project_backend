const express = require('express');
const http = require('http');
const { send } = require('process');
const WebSocket = require('ws');

const PORT_NUMBER = 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const TABLE_SIZE = 6;
const activeNames = [];
const nameToClientInfo = {};
// const exampleClientInfo = {
//     socket: WebSocket,
//     buyInPrice: number,
//     bigBlindPrice: number
//     tableName: string | null,
// };
const tables = [
    {
      name: "High Stakes",
      buyIn: 2000,
      bigBlind: 20,
      playerNames: ["Jerry", "Harry", "Peter"],
    },
    {
      name: "Casual Play",
      buyIn: 500,
      bigBlind: 5,
      playerNames: ["Peter"],
    },
    {
      name: "Low Stakes",
      buyIn: 100,
      bigBlind: 2,
      playerNames: ["Jerry", "Harry", "Peter", "Ellie"],
    },
];
// const exampleTable = {
//     name: string,
//     buyIn: number,
//     bigBlind: number
//     playerNames: string[],
// };

const tableNameToTableInfo = {};

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

function createTable(tableName, buyInPrice, bigBlindPrice) {
    const newTable = {
        name: tableName,
        buyIn: buyInPrice,
        bigBlind: bigBlindPrice,
        playerNames: [],
    };

    tables.push(newTable);
    tableNameToTableInfo[tableName] = newTable;
}

function addPlayerToTable(tableName, playerName) {
    const table = tableNameToTableInfo[tableName];
    if (!table || table.playerNames.length >= TABLE_SIZE) {
        return; // failed to add player
    }

    table.playerNames.push(playerName);
    // todo - set game state to active if (table.playerNames.length >= 2)
    // active state -> hands are being dealt (shuffle and send out cards, 
    // choose dealer, handle players choices, handle players communication
    // evaluate hand winner, divide the pot, etc.)

    // add new Table attributes: pot, communityCards, playerCards, playerBalances
    // server shall send updates on the table state, clients shall update visuals
    // on their end accordingly; in active state, hand starts with a table update
    // sent to all players
}

function handleClientDisconnect(name) {
    // todo - notify opponents if client has assigned tableName, update table, etc.
    // remove tables on disconnect of last player
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

        console.log(objMessage);
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
                break;

            case "joinTableRequest":
                const {tableName, playerName, playerBuyIn, playerBigBlind} = objMessage.data;
                if (tableName === '#newTable') {
                    createTable(playerName, playerBuyIn, playerBigBlind);
                    addPlayerToTable(playerName, playerName);
                } else {
                    addPlayerToTable(tableName, playerName);
                }
                
                break;

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