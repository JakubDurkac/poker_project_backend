import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { getBestCombinationRating, getShuffledCardDeck } from './poker.js';

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
const tables = [];
// const exampleTable = {
    // name: string,
    // buyIn: number,
    // bigBlind: number,
    // playerNames: string[],
    // pot: number,
    // communityCards: Card[],
    // playerNamesToData: {'Harry': {cards: Card[], balance: number, currentBid: number, totalBid: number,
    //     status: "none" | "smallBlind" | "bigBlind" | "call" | "raise" | "check" | "fold" | "inactive";
    //     statusData: number //in case of call or raise
    //
    // } -> private -> clients can see only their cards, opponents cards = [null, null]
    
    // currentDealerIndex: number,
    // currentPlayerIndex: number,
    // deck: {cards: Card[], cardIndex: number}, -> private -> to clients, send null instead
    // disconnectQueue: string[]
// };
// const exampleCard = {
    // suit: 'h', King of Hearts
    // rank: 'k',
// }

const tableNameToTableInfo = {};

function distributeHandRatings(table, allPlayersData) {
    const { playerNames } = table;
    const showdownObjects = [];
    const playerHandRatings = {};
    allPlayersData.forEach((playerData, playerIndex) => {
        const playerCards = [...playerData.cards, ...table.communityCards];
        const playerCardsCopy = JSON.parse(JSON.stringify(playerCards));
        const [overallRating, handAttributes] = isActivePlayer(playerData) ? getBestCombinationRating(playerCards) : [0, 0];
        playerHandRatings[playerIndex] = overallRating;

        if (overallRating > 0) {
            showdownObjects.push({
                playerName: playerNames[playerIndex],
                playerCards: playerCardsCopy,
                overallRating: overallRating,
                handAttributes: handAttributes,
            });
        }

        console.log('Player indexed ', playerIndex, '-> overallRating: ', playerHandRatings[playerIndex]);
    });

    // send the list of playerRatingObjects to the players at the table, so they can display it
    showdownObjects.sort((a, b) => b.overallRating - a.overallRating);
    playerNames.forEach((playerName) => {
        sendMessageToClient(playerName, 'showdown', showdownObjects);
    });

    return playerHandRatings;
}

function concludeHand(table, allPlayersData) {
    const playerHandRatings = distributeHandRatings(table, allPlayersData); // {index: rating}
    console.log("playerHandRatings: ", playerHandRatings);
    const activePlayersSummary = allPlayersData.map((playerData, playerIndex) => {
        return { index: playerIndex, totalBid: playerData.totalBid, handRating: playerHandRatings[playerIndex] };
    }); // [{index: number, totalBid: number, handRating: number}]

    console.log("activePlayersSummary: ", activePlayersSummary);
    const playerWinnings = distributeWinnings(activePlayersSummary); // {index: amount}

    console.log("playerWinnings: ", playerWinnings);
    allPlayersData.forEach((playerData, playerIndex) => {
        const wonAmount = playerWinnings[playerIndex];
        playerData.balance += wonAmount ? Math.round(100 * wonAmount) / 100 : 0;
    });

    table.pot = 0;
}

function concludeBiddingRound(table, allPlayersData, tableName) {
    const { communityCards, deck } = table;
    if (communityCards[0] === null) {
        // show flop (first 3 cards)
        for (let i = 0; i < 3; i++) {
            communityCards[i] = deck.cards[deck.cardIndex++];
        }

    } else if (communityCards[3] === null) {
        // show river (4th card)
        communityCards[3] = deck.cards[deck.cardIndex++];
    
    } else if (communityCards[4] === null) {
        // show turn (5th card)
        communityCards[4] = deck.cards[deck.cardIndex++];

    } else {
        // todo - winner evaluation
        concludeHand(table, allPlayersData);
        table.currentPlayerIndex = -1;
        sendTableUpdateShowdown(table); // show cards of active players
        setTimeout(() => {
            dealPokerHand(tableName); // deal a new hand in a few seconds
        }, 3000);
        
        return;
    }

    sendTableUpdate(table);
}

function distributeWinnings(players) {
    players.sort((a, b) => b.handRating - a.handRating || a.totalBid - b.totalBid);

    let pots = [];
    let remainingPlayers = [...players];

    while (remainingPlayers.length > 0) {
        let currentPlayer = remainingPlayers[0];
        let currentBid = currentPlayer.totalBid;

        let currentPot = {
            amount: 0,
            players: []
        };

        remainingPlayers.forEach(player => {
            let contribution = Math.min(player.totalBid, currentBid);
            currentPot.amount += contribution;
            player.totalBid -= contribution;

            if (contribution > 0) {
                currentPot.players.push(player);
            }
        });

        pots.push(currentPot);
        remainingPlayers = remainingPlayers.filter(player => player.totalBid > 0);
    }

    let winnings = {};
    pots.forEach(pot => {
        let bestHandRating = Math.max(...pot.players.map(p => p.handRating));
        let winners = pot.players.filter(p => p.handRating === bestHandRating);

        let share = pot.amount / winners.length;
        winners.forEach(winner => {
            if (!winnings[winner.index]) {
                winnings[winner.index] = 0;
            }
            winnings[winner.index] += share;
        });
    });

    return winnings;
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
}

function initializePlayerNamesToData(table) {
    table.playerNames.forEach((playerName) => {
        table.playerNamesToData[playerName] = {cards: [null, null], balance: table.buyIn, currentBid: 0, totalBid: 0, status: "none", statusData: 0};
    });
}

function resetPlayerStatuses(table) {
    table.playerNames.forEach((playerName) => {
        const playerData = table.playerNamesToData[playerName]
        playerData.status = "none";
        playerData.statusData = 0;
    });
}

function resetPlayerTotalBids(table) {
    table.playerNames.forEach((playerName) => {
        const playerData = table.playerNamesToData[playerName]
        playerData.totalBid = 0;
        playerData.currentBid = 0;
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

function sendTableUpdateShowdown(table) {
    table.playerNames.forEach((playerName) => {
        if (table.disconnectQueue.includes(playerName)) {
            return; // skip disconnected players
        }
        
        const tableDataCopy = JSON.parse(JSON.stringify(table));
        
        // privatize cards of those who fold, active players cards are shown
        table.playerNames.forEach((name) => {
            const playerData = tableDataCopy.playerNamesToData[name];
            if (!isActivePlayer(playerData)) {
                playerData.cards = [null, null];
            }
        });

        // privatize card deck
        tableDataCopy.deck = null;

        sendMessageToClient(playerName, "tableUpdate", tableDataCopy);
    });
}

function sendTableUpdate(table) {
    table.playerNames.forEach((playerName) => {
        if (table.disconnectQueue.includes(playerName)) {
            return; // skip disconnected players
        }

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
        console.log("!table return");
        return; // table is undefined
    }

    table.playerNames.forEach((playerName) => {
        if (table.playerNamesToData[playerName].balance === 0) {
            table.disconnectQueue.push(playerName);
            sendMessageToClient(playerName, 'bankrupt', '');
        }
    });

    let needTablesListUpdate = false;
    table.disconnectQueue.forEach((playerName) => {
        needTablesListUpdate = true;
        delete table.playerNamesToData[playerName];
        table.playerNames = table.playerNames.filter(name => name !== playerName);
    });

    table.disconnectQueue = [];

    if (needTablesListUpdate) {
        sendTablesListToEveryone();
    }

    const playersCount = table.playerNames.length;
    if (playersCount === 1) {
        console.log("playersCount === 1 return");
        sendTableUpdate(table);
        return; // not enough players
    }

    if (table.deck === null) { // first hand
        console.log("initializePlayerNamesToData called from dealPokerHand.");
        initializePlayerNamesToData(table);
    } else {
        console.log("reset statuses and total bids.");
        resetPlayerStatuses(table);
        resetPlayerTotalBids(table);
    }

    console.log("Dealing new poker hand");
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

    // update current player data based on player's choice
    const currentPlayerData = allPlayersData[senderPlayerIndex];
    currentPlayerData.status = status;
    currentPlayerData.statusData = statusData;
    currentPlayerData.currentBid += statusData;
    currentPlayerData.balance -= statusData;

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

    // pick highest active player bid as activePlayerBid
    if (activePlayersData.length === 0) {
        return;
    }

    let activePlayerBid = activePlayersData[0].currentBid;
    activePlayersData.forEach((activePlayer) => {
        if (activePlayer.currentBid > activePlayerBid) {
            activePlayerBid = activePlayer.currentBid;
        }
    });

    // player can have different (lower) bid from the highest active bid, if he has 0 balance (went all-in)
    const shouldBettingRoundContinue = activePlayersData.find((player) => {
        return (player.currentBid !== activePlayerBid && player.balance > 0) || hasNotPlayedYet(player);
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
        player.totalBid += player.currentBid;
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

        // reset statuses of active players for next bidding round / showdown
        activePlayersData.forEach((player) => {
            player.status = "none";
            player.statusData = 0;
        });

        concludeBiddingRound(table, allPlayersData, tableName); // based on situation - show flop / river / turn / showdown - choosing winner
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
        deck: null,
        disconnectQueue: []
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
    table.playerNamesToData[playerName] = {cards: [null, null], balance: table.buyIn, currentBid: 0, totalBid: 0, status: "fold", statusData: 0};
    nameToClientInfo[playerName].tableName = tableName;

    if (table.playerNames.length === 2) {
        table.isActive = true;
        dealPokerHand(tableName);
    } else {
        sendTableUpdate(table);
    }

    sendTablesListToEveryone();
}

function handlePlayerLeaveTable(tableName, playerName) {
    const table = tableNameToTableInfo[tableName];
    if (!table) {
        return;
    }

    table.disconnectQueue.push(playerName);
    if (table.playerNames[table.currentPlayerIndex] === playerName) {
        processPlayerChoice(playerName, 'fold', 0);
    } else {
        const playerData = table.playerNamesToData[playerName];
        if (playerData) {
            playerData.status = 'fold';
            playerData.statusData = 0;
        }

        sendTableUpdate(table);
    }

    if (table.playerNames.length - table.disconnectQueue.length <= 0) {
        console.log('Removing table.');
        removeTable(tableName);
    } else if (table.playerNames.length - table.disconnectQueue.length <= 1) {
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

function sendChatMessageAroundTable(author, message) {
    const clientInfo = nameToClientInfo[author];
    if (!clientInfo || !clientInfo.tableName) {
        return;
    }

    const dataToSend = {
        chatAuthor: author,
        chatMessage: message,
    };

    const table = tableNameToTableInfo[clientInfo.tableName];
    if (table) {
        table.playerNames.forEach((playerName) => {
            if (playerName !== author) {
                sendMessageToClient(playerName, "chatMessage", dataToSend);
            }
        });
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

            case "inGameChoice":
                const currentPlayerName = objMessage.data.clientName;
                const { status, statusData } = objMessage.data;
                
                processPlayerChoice(currentPlayerName, status, statusData);
                break;

            case "chatMessage":
                const { author, message } = objMessage.data.chatMessage;
                sendChatMessageAroundTable(author, message);
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