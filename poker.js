const suits = "hdsc";
const ranks = "23456789tjqka";

const initialCardDeck = [];
for (let i = 0; i < suits.length; i++) {
    for (let j = 0; j < ranks.length; j++) {
        initialCardDeck.push({suit: suits.charAt(i), rank: ranks.charAt(j)});
    }
}

const rankToValue = {
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    't': 10,
    'j': 11,
    'q': 12,
    'k': 13,
    'a': 14,
};

const handToRating = {
    'HIGH': 1,
    'PAIR': 2,
    'TWO_PAIR': 3,
    'THREE_OF_A_KIND': 4,
    'STRAIGHT': 5,
    'FLUSH': 6,
    'FULL_HOUSE': 7,
    'FOUR_OF_A_KIND': 8,
    'STRAIGHT_FLUSH': 9,
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

function sortCardsByRankDescendingly(cards) {
    cards.sort((a, b) => {
        return rankToValue[b.rank] - rankToValue[a.rank];
    });
}

export function getBestCombinationRating(cards) {
    sortCardsByRankDescendingly(cards);

    const handAttributes = {
        rating: 0,
        cards: [null, null, null, null, null], // best combination
    }

    const handEvaluators = [straightFlush, fourOfAKind, fullHouse, flush, straight, threeOfAKind, twoAndOnePair, highCard];

    let i = 0;
    while (handAttributes.rating === 0) {
        handEvaluators[i](cards, handAttributes);
        i++;
    }

    return handAttributes.rating; // later maybe return also the handAttributes.cards
}

function straightFlush(cards, handAttributes) {

}

function fourOfAKind(cards, handAttributes) {

}

function fullHouse(cards, handAttributes) {

}

function flush(cards, handAttributes) {

}

function straight(cards, handAttributes) {

}

function threeOfAKind(cards, handAttributes) {

}

function twoAndOnePair(cards, handAttributes) {

}

function highCard(cards, handAttributes) {

}