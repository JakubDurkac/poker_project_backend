import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { getShuffledCardDeck } from './poker';

const PORT_NUMBER = 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

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
        pot: 0,
        communityCards: [null, null, null, null, null],
        playerNamesToData: {"Jerry": {cards: [{suit: 'c', rank: '7'}, {suit: 'd', rank: 't'}], balance: 1000, currentBid: 0},
                        "Harry": {cards: [{suit: 'h', rank: 'a'}, {suit: 'c', rank: 'k'}], balance: 1000, currentBid: 0},
                        "Peter": {cards: [{suit: 's', rank: 'q'}, {suit: 's', rank: '3'}], balance: 1000, currentBid: 0}},
        isActive: false,
        currentDealerIndex: 0,
        currentPlayerIndex: 0,
        deck: {cards: [], cardIndex: 0}
    },
];
// const exampleTable = {
    // name: string,
    // buyIn: number,
    // bigBlind: number,
    // playerNames: string[],
    // pot: number,
    // communityCards: Card[],
    // playerNamesToData: {'Harry': {cards: Card[], balance: number, currentBid: number}} -> private -> clients can see only their cards, opponents cards = [null, null]
    // currentDealerIndex: number,
    // currentPlayerIndex: number,
    // deck: {cards: Card[], cardIndex: number} -> private -> to clients, send null instead
// };
// const exampleCard = {
    // suit: 'h', King of Hearts
    // rank: 'k',
// }

const tableNameToTableInfo = {};

function collectBlinds(table) {
    const {currentDealerIndex, playerNames, playerNamesToData, bigBlind} = table;

    const offset = playerNames.length === 2 ? 0 : 1;
    const smallBlindPlayerIndex = (currentDealerIndex + offset) % playersCount;
    const bigBlindPlayerIndex = (currentDealerIndex + offset + 1) % playersCount;

    const smallBlindPlayerData = playerNamesToData[playerNames[smallBlindPlayerIndex]];
    const bigBlindPlayerData = playerNamesToData[playerNames[bigBlindPlayerIndex]];

    // todo - solve player bankruptcy, pay only what a player has left
    smallBlindPlayerData.balance -= bigBlind / 2;
    bigBlindPlayerData.balance -= bigBlind;

    smallBlindPlayerData.currentBid = bigBlind / 2;
    bigBlindPlayerData.currentBid = bigBlind;
}

function initializePlayerNamesToData(table) {
    table.playerNames.forEach((playerName) => {
        table.playerNamesToData[playerName] = {cards: [null, null], balance: table.buyIn, currentBid: 0};
    });
}

function distributeCards(table) {
    const {deck} = table;
    table.playerNames.forEach((playerName) => {
        const playerData = table.playerNamesToData[playerName];
        if (playerData) {
            playerData.cards = [deck.cards[deck.cardIndex++], deck.cards[deck.cardIndex++]];
        }
    });

    table.communityCards = []
    for (let i = 0; i < 5; i++) {
        table.communityCards.push(deck.cards[deck.cardIndex]);
        deck.cardIndex++;
    }
}

function dealPokerHand(tableName) {
    const table = tableNameToTableInfo[tableName];
    if (!table) {
        return; // table is undefined
    }

    const playersCount = table.playerNames.length;

    if (table.deck === null) { // first hand
        initializePlayerNamesToData(table);
    }

    table.deck = {cards: getShuffledCardDeck(), cardIndex: 0};
    table.currentDealerIndex = (table.currentDealerIndex + 1) % playersCount; // at start index goes from -1 to 0, later -> index increments
    table.currentPlayerIndex = (table.currentDealerIndex + 3) % playersCount;

    distributeCards(table);
    collectBlinds(table);

    // todo - send table update to players
}

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

function sendTablesListToEveryone() {
    activeNames.forEach((toName) => {
        sendTablesList(toName);
    });
}

function createTable(tableName, buyInPrice, bigBlindPrice) {
    const newTable = {
        name: tableName,
        buyIn: buyInPrice,
        bigBlind: bigBlindPrice,
        playerNames: [],
        pot: 0,
        communityCards: [null, null, null, null, null],
        playerNamesToData: {},
        isActive: false,
        currentDealerIndex: -1,
        currentPlayerIndex: -1,
        deck: null
    };

    tables.push(newTable);
    tableNameToTableInfo[tableName] = newTable;
}

function removeTable(tableName) {
    removeTableFromTablesList(tableName);
    delete tableNameToTableInfo[tableName];
}

function addPlayerToTable(tableName, playerName) {
    const table = tableNameToTableInfo[tableName];
    if (!table || table.playerNames.length >= TABLE_SIZE) {
        return; // failed to add player
    }

    table.playerNames.push(playerName);
    nameToClientInfo[playerName].tableName = tableName;

    // game entry point:
    // 2 players -> game can start
    // first hand starts after 2nd player joins,
    // next hands will start automatically,
    // while table is active
    // table becomes inactive after there's
    // only 1 player left
    if (table.playerNames.length === 2) {
        table.isActive = true;
        dealPokerHand(tableName);
    }

    sendTablesListToEveryone();

    // active state -> hands are being dealt (shuffle and send out cards, 
    // choose dealer, handle players choices, handle players communication
    // evaluate hand winner, divide the pot, etc.)
    // server shall send updates on the table state, clients shall update visuals
    // on their end accordingly; in active state, hand starts with a table update
    // sent to all players
}

function handlePlayerLeaveTable(tableName, playerName) {
    // todo - notify opponents that playerName left, e.g. send table update
    // to the players at the table at the end of this function
    const table = tableNameToTableInfo[tableName];
    if (!table) {
        return;
    }

    delete table.playerNamesToData[playerName];
    table.playerNames = table.playerNames.filter(name => name !== playerName);

    if (table.playerNames.length <= 0) {
        console.log('removing table');
        removeTable(tableName);
        console.log(tables);
    } else if (table.playerNames.length <= 1) {
        table.isActive = false;
    }

    sendTablesListToEveryone();
}

function handleClientDisconnect(name) {
    const clientInfo = nameToClientInfo[name];
    console.log("Table:", clientInfo.tableName);
    if (clientInfo && clientInfo.tableName) {
        handlePlayerLeaveTable(clientInfo.tableName, name);
    }

    delete nameToClientInfo[name];
    removeName(name);
}

function removeName(name) {
    const indexToRemove = activeNames.indexOf(name);
    if (indexToRemove >= 0) {
        activeNames.splice(indexToRemove, 1);
    }
}

function removeTableFromTablesList(tableName) {
    const indexToRemove = tables.findIndex((table) => {
        return table.name === tableName;
    });

    console.log(indexToRemove);

    if (indexToRemove >= 0) {
        tables.splice(indexToRemove, 1);
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