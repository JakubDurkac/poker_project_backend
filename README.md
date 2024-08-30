# [moodypoker.com](https://moodypoker.com/) (backend)
A backend solution for the moodypoker web app.
- **backend** server written in **Javascript** using **Node.js**, **Express** and **WebSocket**, deployed using [Render](https://render.com/)
- for **frontend** look [here](https://github.com/JakubDurkac/poker_project)

### Features
- manages and stores connected players and active poker tables info
- creates new tables or make players join existing ones based on their requests
- for each table, after 2+ players are joined, server manages their game
- server chooses dealer, who's turn it is, collects blinds, processes each player's in-game choices (Raise, Call, Check, Fold)
- it concludes bidding rounds by revealing community cards (flop, river, turn)
- after players reach cards showdown, server calculates their best combinations and generates hand ratings, precisely representing the strength of one's hand
- manages distribution of winnings (even in case of n-way draws - sidepots)
- automatically sends out table updates to its players, including all the necessary information for clients to display
- automatically sends out updates of available tables list to everyone when a change happens (player connects, disconnects)
- acts as a middleman between players at one table, forwarding choices, chat messages, disconnections, etc.

### To run server locally
- clone the repository
```
git clone https://github.com/JakubDurkac/poker_project_backend.git
```
- in the root directory, install the dependencies for a Node.js project using:
```
npm install
```
- run server
```
node server.js
```
- make sure clients are connecting using the right address
- example connection from client.js:
```
let socket = new WebSocket('ws://localhost:3000');
```
