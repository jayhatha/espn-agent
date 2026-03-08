# Quick Task 75: Fix current player name not showing on mobile

## Goal
The mobile draft companion page doesn't show the nominated player's name because the `CurrentAuctionPlayer` interface fields don't match what the extension actually sends.

## Root Cause
Extension sends: `{ playerName, positions, playerId, currentBid }`
Mobile types expected: `{ name, position, id, currentBid }`

## Fix
1. Update `CurrentAuctionPlayer` in `useDraftLiveSocket.ts` to use `playerName`, `positions?`, `playerId?`
2. Update `page.tsx` to render `currentPlayer.playerName` and `currentPlayer.positions?.join("/")`

## Status: EXECUTED
