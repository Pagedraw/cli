# Pagedraw CLI

<img src="https://ucarecdn.com/dd0f9a9d-ab86-4ce4-a884-62a1ac769c2e/favicon.png" alt="Pagedraw logo" width="150" />

## Setup

To install the PageDraw CLI tool, use NPM:
```npm install -g pagedraw```

### Usage

Now the `pagedraw` command should be available in your terminal. To test it type

```pagedraw login```

## Development

To setup your environment for local development:
```
yarn run init-dev
```

To run the app:
```
yarn run pagedraw
```
e.g.:
```
yarn run pagedraw login
yarn run pagedraw pull
...
```

To remove artifacts:
```
yarn run clean
```

## Publishing

To publish run

```
npm version patch|minor|major
npm publish
```

**Don't forget to update the version in firebase's `cli_info`**