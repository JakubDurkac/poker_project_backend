const suits = "hdsc";
const ranks = "23456789tjqka";

const initialCardDeck = [];
for (let i = 0; i < suits.length; i++) {
    for (let j = 0; j < ranks.length; j++) {
        initialCardDeck.push({suit: suits.charAt(i), rank: ranks.charAt(j)});
    }
}

export function getShuffledCardDeck() {
    const newCardDeck = JSON.parse(JSON.stringify(initialCardDeck));

    // Fisher-Yates shuffle algorithm
    for (let i = newCardDeck.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1)); 
        [newCardDeck[i], newCardDeck[j]] = [newCardDeck[j], newCardDeck[i]];
    }

    return newCardDeck;
}