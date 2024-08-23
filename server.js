import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { getShuffledCardDeck } from './poker.js';

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
        playerNamesToData: {"Jerry": {cards: [{suit: 'c', rank: '7'}, {suit: 'd', rank: 't'}], balance: 1000, currentBid: 0, status: "none", statusData: 0},
                        "Harry": {cards: [{suit: 'h', rank: 'a'}, {suit: 'c', rank: 'k'}], balance: 1000, currentBid: 0, status: "none", statusData: 0},
                        "Peter": {cards: [{suit: 's', rank: 'q'}, {suit: 's', rank: '3'}], balance: 1000, currentBid: 0, status: "none", statusData: 0}},
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
    // playerNamesToData: {'Harry': {cards: Card[], balance: number, currentBid: number, 
    //     status: "none" | "smallBlind" | "bigBlind" | "call" | "raise" | "check" | "fold" | "inactive";
    //     statusData: number //in case of call or raise
    //
    // } -> private -> clients can see only their cards, opponents cards = [null, null]
    
    // currentDealerIndex: number,
    // currentPlayerIndex: number,
    // deck: {cards: Card[], cardIndex: number} -> private -> to clients, send null instead
// };
// const exampleCard = {
    // suit: 'h', King of Hearts
    // rank: 'k',
// }

const tableNameToTableInfo = {};

function concludeBiddingRound(table) {
    
}

function collectBlinds(table, smallBlindPlayerIndex, bigBlindPlayerIndex) {
    const {playerNames, playerNamesToData, bigBlind} = table;
    console.log("Collecting blinds from: ", playerNames);
    
    const smallBlind = bigBlind / 2;
    const smallBlindPlayerData = playerNamesToData[playerNames[smallBlindPlayerIndex]];
    const bigBlindPlayerData = playerNamesToData[playerNames[bigBlindPlayerIndex]];

    console.log("SmallBlind: ", smallBlindPlayerData);
    console.log("BigBlind: ", bigBlindPlayerData);

    // handling players not having enough balance for blinds
    const smallBlindBid = smallBlindPlayerData.balance < smallBlind ? smallBlind - smallBlindPlayerData.balance : smallBlind;
    const bigBlindBid = bigBlindPlayerData.balance < bigBlind ? bigBlind - bigBlindPlayerData.balance : bigBlind;
   
    // updating playerData
    smallBlindPlayerData.balance -= smallBlindBid;
    smallBlindPlayerData.currentBid = smallBlindBid;
    smallBlindPlayerData.status = "smallBlind";
    smallBlindPlayerData.statusData = smallBlindBid;

    bigBlindPlayerData.balance -= bigBlindBid;
    bigBlindPlayerData.currentBid = bigBlindBid;
    bigBlindPlayerData.status = "bigBlind";
    bigBlindPlayerData.statusData = bigBlindBid;

    // all bids should be collected at the end of bidding round instead of immediately
    // table.pot = smallBlindBid + bigBlindBid;
}

function initializePlayerNamesToData(table) {
    table.playerNames.forEach((playerName) => {
        table.playerNamesToData[playerName] = {cards: [null, null], balance: table.buyIn, currentBid: 0, status: "none", statusData: 0};
    });
}

function resetPlayerStatuses(table) {
    table.playerNames.forEach((playerName) => {
        const playerData = table.playerNamesToData[playerName]
        playerData.status = "none";
        playerData.statusData = 0;
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

    table.communityCards = [null, null, null, null, null];
}

function sendTableUpdate(table) {
    table.playerNames.forEach((playerName) => {
        const tableDataCopy = JSON.parse(JSON.stringify(table));
        
        // privatize cards of opponents
        table.playerNames.forEach((name) => {
            if (playerName !== name) {
                tableDataCopy.playerNamesToData[name].cards = [null, null];
            }
        });

        // privatize card deck
        tableDataCopy.deck = null;

        sendMessageToClient(playerName, "tableUpdate", tableDataCopy);
    });
}

function dealPokerHand(tableName) {
    const table = tableNameToTableInfo[tableName];
    if (!table) {
        return; // table is undefined
    }

    const playersCount = table.playerNames.length;
    if (playersCount === 1) {
        return; // not enough players
    }

    if (table.deck === null) { // first hand
        initializePlayerNamesToData(table);
    } else {
        resetPlayerStatuses(table);
    }

    table.deck = {cards: getShuffledCardDeck(), cardIndex: 0};
    table.currentDealerIndex = (table.currentDealerIndex + 1) % playersCount; // at start index goes from -1 to 0, later -> index increments

    const offset = playersCount === 2 ? 0 : 1;
    const smallBlindPlayerIndex = (table.currentDealerIndex + offset) % playersCount;
    const bigBlindPlayerIndex = (table.currentDealerIndex + offset + 1) % playersCount;
    table.currentPlayerIndex = (table.currentDealerIndex + offset + 2) % playersCount;

    distributeCards(table);
    collectBlinds(table, smallBlindPlayerIndex, bigBlindPlayerIndex);

    sendTableUpdate(table);
}

function isActivePlayer(player) {
    return player.status !== 'fold' && player.status !== 'inactive';
}

function hasNotPlayedYet(player) {
    return player.status === 'none' || player.status === 'smallBlind' || player.status === 'bigBlind';
}

function processPlayerChoice(currentPlayerName, status, statusData) {
    const tableName = nameToClientInfo[currentPlayerName].tableName;
    const table = tableNameToTableInfo[tableName];
    if (!table) {
        return; // table is undefined
    }

    const {playerNames, playerNamesToData} = table;
    const senderPlayerIndex = playerNames.findIndex((name) => {
        return name === currentPlayerName;
    });

    if (senderPlayerIndex === -1 || senderPlayerIndex !== table.currentPlayerIndex) {
        return; // player not at the table or not their turn
    }

    const allPlayersData = playerNames.map((playerName) => {
        return playerNamesToData[playerName];
    });

    console.log("AllPlayersData before: ", allPlayersData);

    // update current player data based on player's choice
    const currentPlayerData = allPlayersData[senderPlayerIndex];
    currentPlayerData.status = status;
    currentPlayerData.statusData = statusData;
    currentPlayerData.currentBid += statusData;
    currentPlayerData.balance -= statusData;

    console.log("AllPlayersData after: ", allPlayersData);

    const activePlayersData = allPlayersData.filter((player) => {
        return isActivePlayer(player);
    });

    // 1 player left, winner of the hand
    if (activePlayersData.length === 1) {
        allPlayersData.forEach((player) => {
            table.pot += player.currentBid;
            player.currentBid = 0;
        });

        activePlayersData[0].balance += table.pot;
        table.pot = 0;

        table.currentPlayerIndex = -1;
        sendTableUpdate(table);

        setTimeout(() => {
            dealPokerHand(tableName);
        }, 3000);

        return;
    }

    const activePlayerBid = activePlayersData[0].currentBid;
    const shouldBettingRoundContinue = activePlayersData.find((player) => {
        return player.currentBid !== activePlayerBid || hasNotPlayedYet(player);
    });

    if (shouldBettingRoundContinue) {
        // choose whose turn it is (first active player left to the current player)
        table.currentPlayerIndex = (table.currentPlayerIndex + 1) % playerNames.length;
        while (!isActivePlayer(allPlayersData[table.currentPlayerIndex])) {
            table.currentPlayerIndex = (table.currentPlayerIndex + 1) % playerNames.length;
        }

        sendTableUpdate(table);
        return;
    }
    
    // add all bids to the pot
    allPlayersData.forEach((player) => {
        table.pot += player.currentBid;
        player.currentBid = 0;
    });

    // disable choices, next stage update in a few seconds, so players can process what's happening
    table.currentPlayerIndex = -1;
    sendTableUpdate(table);

    setTimeout(() => {
        // choose whose turn it is (first active player left to the dealer)
        table.currentPlayerIndex = (table.currentDealerIndex + 1) % playerNames.length;
        while (!isActivePlayer(allPlayersData[table.currentPlayerIndex])) {
            table.currentPlayerIndex = (table.currentPlayerIndex + 1) % playerNames.length;
        }

        // reset statuses for next bidding round / showdown
        activePlayersData.forEach((player) => {
            player.status = "none";
            player.statusData = 0;
        });

        concludeBiddingRound(table); // based on situation - show flop / river / turn / showdown - choosing winner
    }, 3000);
}

function sendTablesList(toName) {
    sendMessageToClient(toName, "tablesList", tables);
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
    // here initialize playerNamesToData[playerName] marked with "fold" state, so the player starts on next hand
    table.playerNamesToData[playerName] = {cards: [null, null], balance: table.buyIn, currentBid: 0, status: "fold", statusData: 0};
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
    } else {
        sendTableUpdate(table);
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
    // todo - instead of removing player from table immediately, keep him there
    // until the start of next hand (where he will be removed), this player
    // should be marked "disconnected" in some way, his turn is skipped as "fold"
    // but he is still able to win and decrease balance of others, if this auto-fold
    // does not happen in time after his disconnect and before the end of hand
    
    // todo - disconnectQueue to the table, the player will be removed from table
    // at the end of the hand
    const table = tableNameToTableInfo[tableName];
    if (!table) {
        return;
    }

    // instead of this part, put player to disconnect queue
    delete table.playerNamesToData[playerName];
    table.playerNames = table.playerNames.filter(name => name !== playerName);
    // 

    if (table.playerNames.length <= 0) {
        removeTable(tableName);
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

function sendMessageToClient(toName, messageType, messageData) {
    const clientInfo = nameToClientInfo[toName];
    if (!clientInfo || !clientInfo.socket) {
        return;
    }

    const message = {
        type: messageType,
        data: messageData,
    };

    clientInfo.socket.send(JSON.stringify(message));
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

            case "inGameChoice":
                const currentPlayerName = objMessage.data.clientName;
                const { status, statusData } = objMessage.data;
                
                processPlayerChoice(currentPlayerName, status, statusData);

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