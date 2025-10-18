# TFT-RESULTS

This bot tracks players to notify a server when they have finished a game.

## Requirement

- Node.JS >= v18.19.0

## Installation

Clone this repository and install the dependencies using

```bash
  npm -i
```

Fill the .env with the appropriate values, then run

### Launching the bot
```bash
    npm start
```

### (Optional) Launch bot inside Docker
```bash
    docker build . -t tft-results
    docker run -d tft-results
```

## Usage
Users can now ask to be tracked by using **/register** command on the dedicated channel of the discord server.