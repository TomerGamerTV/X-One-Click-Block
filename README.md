# X One Click Block

Instantly block users on X (formerly Twitter) with a single click directly from their posts and comments.

**Version:** 1.0.0

## Features
- One-click block icons neatly placed in the action bar of Tweets and comments.
- Custom notification popup aligned with X's UI styling.
- Batch blocking safety queue (prevents rate limits or account suspension).
- Automatic Undo queueing.
- Supports both Chrome and Firefox.

## Credits
Created from scratch by **@TomerGamerTV**.

## Build Instructions
If you want to build this extension from source, follow these steps:
1. Ensure you have [Bun](https://bun.sh/) installed.
2. Clone this repository and navigate into the folder.
3. Run `bun install` to install dependencies.
4. Run `bun run build` to generate the compiled `.zip` sizes.

Included automatically is a Github Action that handles releasing these `.zip` files for you whenever you push a new version tag (e.g., `git push --tags`).
