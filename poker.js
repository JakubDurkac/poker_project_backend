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

const RATING_BASE = 16;
const DECIDERS_COUNT = 6; // hand type + up to 5 card ranks 

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
        tieBreakers: [0, 0, 0, 0, 0],
    }

    const handEvaluators = [straightFlush, fourOfAKind, fullHouse, flush, straight, threeOfAKind, twoAndOnePair, highCard];
    const cardsWithValuedRanks = cards.map((card) => {
        return {suit: card.suit, rank: rankToValue[card.rank]};
    });

    let i = 0;
    while (handAttributes.rating === 0) {
        handEvaluators[i](cardsWithValuedRanks, handAttributes);
        i++;
    }

    console.log("handAttributes: ", handAttributes);
    let overallRating = 0;
    const decidingFactors = [handAttributes.rating].concat(handAttributes.tieBreakers);
    decidingFactors.forEach((decidingFactor, index) => {
        const importanceLevel = DECIDERS_COUNT - index - 1;
        overallRating += decidingFactor * (RATING_BASE ** importanceLevel);
    });

    return [overallRating, handAttributes.rating];
}

function straightFlushOrRegularStraight(cards, handAttributes, isRegularStraight) {
    let rankDiff = 1;
    let lowEndRankDiff = 9;

    for (let i = 0; i <= 2; i++) {   
        const targetRank = cards[i].rank;
        const targetSuit = cards[i].suit;
        
        for (let j = i + 1; j <= 6; j++) {
            const currentSuit = isRegularStraight ? targetSuit : cards[j].suit;

            if ((targetRank === cards[j].rank + rankDiff)
             && (targetSuit === currentSuit)) {
                rankDiff++;
            }

            if ((targetRank === 14) // ace can also have rank value 1
             && (targetRank === cards[j].rank + lowEndRankDiff)
             && (targetSuit == currentSuit)) {
                lowEndRankDiff++;
            }
        }

        if (rankDiff >= 5) {
            handAttributes.rating = isRegularStraight ? handToRating['STRAIGHT'] : handToRating['STRAIGHT_FLUSH'];
            handAttributes.tieBreakers[0] = targetRank; // leading card rank
            return;
        }

        if (lowEndRankDiff >= 13) {
            handAttributes.rating = isRegularStraight ? handToRating['STRAIGHT'] : handToRating['STRAIGHT_FLUSH'];
            handAttributes.tieBreakers[0] = 5; // low end straight leading card rank
        }

        rankDiff = 1;
        lowEndRankDiff = 9;
    }

    return;
}

function straightFlush(cards, handAttributes) {
    const isRegularStraight = false;
    straightFlushOrRegularStraight(cards, handAttributes, isRegularStraight);
}

function straight(cards, handAttributes) {
    const isRegularStraight = true;
    straightFlushOrRegularStraight(cards, handAttributes, isRegularStraight);
}

function fourOfAKind(cards, handAttributes) {
    for (let i = 0; i <= 3; i++) {
        const targetRank = cards[i].rank;
        if (targetRank === cards[i + 1].rank
         && targetRank === cards[i + 2].rank
         && targetRank === cards[i + 3].rank) {
            handAttributes.rating = handToRating['FOUR_OF_A_KIND'];
            handAttributes.tieBreakers[0] = targetRank; // four of a kind rank
            
            for (let j = 0; j <= 6; j++) {
                if (cards[j].rank !== targetRank) {
                    handAttributes.tieBreakers[1] = cards[j].rank; // highest 5th card
                    break;
                }
            }

            return;
        }
    }

    return;
}

function getSameCardsRank(isThreeOrTwo, cards, exceptRank) {
    // isThreeOrTwo = 0 ... finding Pair rank
    // isThreeOrTwo = 1 ... finding Three of a Kind rank
    const offset = isThreeOrTwo ? 1 : 0;
    for (let i = 0; i <= 5 - offset; i++) {
        const targetRank = cards[i].rank;
        if (targetRank !== exceptRank
         && targetRank === cards[i + 1].rank
         && targetRank === cards[i + 2 * offset].rank) {
            return targetRank;
        }
    }

    return 0;
}

function fullHouse(cards, handAttributes) {
    const threeRank = getSameCardsRank(true, cards, 0);
    const pairRank = getSameCardsRank(false, cards, threeRank);
    if (threeRank !== 0 && pairRank !== 0) {
        handAttributes.rating = handToRating['FULL_HOUSE'];
        handAttributes.tieBreakers[0] = threeRank;
        handAttributes.tieBreakers[1] = pairRank;
        return;
    }

    return;
}

function flush(cards, handAttributes) {
    let flushRanks = [0, 0, 0, 0];
    let sameSuitCounter = 0;

    for (let i = 0; i <= 2; i++) {
        const targetRank = cards[i].rank;
        const targetSuit = cards[i].suit;

        for (let j = i + 1; j <= 6; j++) {
            if (targetSuit === cards[j].suit) {   
                flushRanks[sameSuitCounter] = cards[j].rank;
                sameSuitCounter++;
            }

            if (sameSuitCounter === 4) {
                handAttributes.rating = handToRating['FLUSH'];
                handAttributes.tieBreakers = [targetRank].concat(flushRanks); // card ranks from highest
                return;
            }
        }

        sameSuitCounter = 0;
        flushRanks = [0, 0, 0, 0];
    }

    return;
}

function threeOfAKind(cards, handAttributes) {
    const threeRank = getSameCardsRank(true, cards, 0);
    if (threeRank === 0) {
        return;
    }

    let otherRanks = [0, 0];
    let otherCounter = 0;

    for (let i = 0; i <= 6; i++) {
        const targetRank = cards[i].rank;
        if (targetRank !== threeRank) {
            otherRanks[otherCounter] = targetRank;
            otherCounter++;
        }

        if (otherCounter === 2) {
            handAttributes.rating = handToRating['THREE_OF_A_KIND'];

            handAttributes.tieBreakers = [threeRank].concat(otherRanks); // 1st, 2nd highest other card ranks
            return;
        }
    }

    return;
}

function twoAndOnePair(cards, handAttributes) {
    const pairOneRank = getSameCardsRank(false, cards, 0);
    if (pairOneRank === 0) {
        return;
    }

    // One Pair
    const pairTwoRank = getSameCardsRank(false, cards, pairOneRank);
    if (pairTwoRank === 0) {
        let otherRanks = [0, 0, 0];
        let otherCounter = 0;

        for (let i = 0; i <= 6; i++) {
            const targetRank = cards[i].rank;
            if (targetRank !== pairOneRank) {
                otherRanks[otherCounter] = targetRank;
                otherCounter++;
            }

            if (otherCounter === 3) {
                handAttributes.rating = handToRating['PAIR'];
                handAttributes.tieBreakers = [pairOneRank].concat(otherRanks); // 1st - 3rd highest other card ranks
                return;
            }
        }
    }

    // Two Pair
    for (let i = 0; i <= 6; i++) {
        const targetRank = cards[i].rank;
        if (targetRank !== pairOneRank
         && targetRank !== pairTwoRank) {
            handAttributes.rating = handToRating['TWO_PAIR'];
            handAttributes.tieBreakers = [pairOneRank, pairTwoRank, targetRank];
            return;
        }
    }

    return;
}

function highCard(cards, handAttributes) {
    handAttributes.rating = handToRating['HIGH'];
    for (let i = 0; i <= 4; i++) {
        handAttributes.tieBreakers[i] = cards[i].rank; // 5 highest cards
    }

    return;
}