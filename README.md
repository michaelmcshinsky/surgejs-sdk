# SurgeJS SDK

[![npm version](https://img.shields.io/npm/v/surgejs-sdk.svg?style=flat-square)](https://www.npmjs.org/package/surgejs-sdk) [![Gitpod Ready-to-Code](https://img.shields.io/badge/Gitpod-Ready--to--Code-blue?logo=gitpod)](https://gitpod.io/#https://github.com/surgejs-sdk/surgejs-sdk) [![install size](https://packagephobia.now.sh/badge?p=surgejs-sdk)](https://packagephobia.now.sh/result?p=surgejs-sdk)

Unofficial compilation project of API endpoints found in the Surge Cli in order to bring some functionality into a structured and documented format.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Example](#example)
- [Methods](#methods)
  - [Authentication](#authentication)
  - [Projects](#projects)
  - [Payments](#payments)
- [Support](#support)

## Features

- Common JS (CJS)
- ES Modules (ESM) enabled
- TypeScript enabled

## Installation

Using npm:

```bash
npm install surgejs-sdk
```

Using yarn:

```bash
yarn add surgejs-sdk
```

## Example

<b>note: CommonJS usage</b>

```javascript
const Surge = require('surgejs-sdk');
```

Logging the user into surge servers

```javascript
const Surge = require('surgejs-sdk');

const surge = new Surge('email@domain.com', 'password');

surge
  .login()
  .then(function(response) {
    // handle success
    console.log(response);
  })
  .catch(function(error) {
    // handle error
    console.log(error);
  });
```

## API

Every API must have Basic Authentication attached with user credentials. This is required for any call made to the servers.

When using the surgejs-sdk library, all you need to do is provide your credentials in the `new Surge('email@domain.com', 'password)` arguments. No need to worry about http headers.

### Methods

All provided methods are promise based so we won't add `.then(...).catch(...)` to all of the examples.

#### Authentication

- [Login](#login)
- [Logout](#logout)
- [Account](#account)
- [Reset Password](#reset-password)
- [Stats](#stats)

##### Login

Authenticate the user with surge servers using their email and password provided upon initiation of the library. See [Installation](#installation)

```javascript
surge.login();
```

Response

```json
{
  "email": "email@domain.com",
  "token": "abcdefg0123456789"
}
```

##### Logout

Logout is an informal event. Remove your locally stored credentials (email, token) to "logout" the user.

##### Account

Get the user's account information.

```javascript
surge.account();
```

Response

```json
{
  "email": "email@domain.com",
  "id": "0000-0000-0000",
  "uuid": "00000000-0000-0000-0000-000000000000",
  "role": 0,
  "updated_at": "2020-01-01T01:01:01.000Z",
  "created_at": "2020-01-01T01:01:01.000Z",
  "email_verified_at": "2020-01-01T01:01:01.000Z",
  "payment_id": null,
  "plan": {
    "id": "abcdefg-00",
    "name": "abcdefg",
    "amount": "0000",
    "friendly": "abcdefg",
    "dummy": true,
    "current": true,
    "metadata": {
      "type": "account"
    },
    "ext": "00",
    "perks": [],
    "comped": false
  },
  "card": null
}
```

##### Reset Password

Initiate password reset steps for a user's email.

```javascript
surge.resetPassword('email@domain.com');
```

Response

```
Reset instructions send to email.
```

##### Stats

Get stats about your account usage.

```javascript
surge.stats();
```

Response

```json
{
  "calls": "7515855",
  "deployemnts": "7515855",
  "bytes": "77879308777468",
  "files": "903079863",
  "accounts": "148665",
  "projects": "1193327",
  "builds": "1169",
  "deployments": "7515855",
  "formatted": {
    "calls": "7,515,855",
    "deployments": "7,515,855",
    "bytes": "70.83 TB",
    "files": "903,079,863",
    "accounts": "148,665",
    "projects": "1,193,327",
    "builds": "1,169"
  }
}
```

#### Projects

- [Discover](#discover)
- [List](#list)
- [Deploy](#deploy)
- [Teardown](#teardown)

##### Discover

Surge Cli uses [moniker](https://www.npmjs.com/package/moniker) to randomly generate domain name for the user.

```javascript
surge.discover();
```

##### List

```javascript
surge.list();
```

Response

```json
[
    {
    "domain": "domain_name.surge.sh",
    "planName": "Standard",
    "output": {},
    "rev": 0123456789,
    "config": {},
    "cmd": "surge",
    "email": "email@domain.com",
    "platform": "surge.sh",
    "cliVersion": "0.21.7",
    "message": null,
    "buildTime": null,
    "ip": "00.000.000.00",
    "privateFileList": [],
    "publicFileCount": 00,
    "publicTotalSize": 000000,
    "privateFileCount": 00,
    "privateTotalSize": 0000000,
    "uploadStartTime": 0000000000000,
    "uploadEndTime": 0000000000000,
    "uploadDuration": 1.000,
    "preview": "0000000000000-domain_name.surge.sh",
    "timeAgoInWords": "4 weeks ago"
  },
  ...
]
```

##### Deploy

Not yet implemented.

```
PUT https://surge.surge.sh/<domain_name>
Content-Types: application/json
```

| Parameters | Type     | Default | Description                                                                        |
| ---------- | -------- | ------- | ---------------------------------------------------------------------------------- |
| domain     | `string` | N/A     | `domain_name`.surge.sh which you would like to create. Do not include ".surge.sh". |
| data       | `gzip`   | N/A     | Tar packed, gzip files including the index.html to serve your static site.         |

Project is ran through three pipes in the cli:

```node
// cli files:
// 1. prep.js
// 2. deploy.js
// 3. project.js

var fsReader = require('surge-fstream-ignore');

// Read Project
var project = fsReader({ path: req.project, ignoreFiles: ['.surgeignore'] });

// we always ignore .git directory
project.addIgnoreRules(ignore);

// chain all this together...
project
  .pipe(tar.Pack())
  .pipe(zlib.Gzip())
  .pipe(handshake);
```

Untested libraries equivalent to Node:

- Tar - [tar-js](https://github.com/beatgammit/tar-js)
- GZip - [gzip-js](https://github.com/beatgammit/gzip-js)

##### Teardown

Remove the domain and hosted site from surge servers. e.g. `domain_name.surge.sh`.

```javascript
surge.teardown('domain_name');
```

Response

```json
{
  "msg": "project removed",
  "nsDomain": "surge.world",
  "regions": {},
  "servers": []
}
```

#### Payments

- [Card](#card)
- [Set Card](#set-card)
- [Payment](#payment)
- [Plans](#plans)
- [Subscribe](#subscribe)
- [Subscription](#subscription)

**Payments are still under development.**

##### Card

N/A

##### Set Card

N/A

##### Payment

Multi step process.

1. If the user does not exist in stripe, choose a plan and credit card information.
2. If the user exists in stripe, choose a new plan to pay for.

+++ Request

```bash
GET https://surge.surge.sh/<domain_name>/plans
Content-Types: application/json
```

Response

```json
N/A
```

##### Plans

N/A

##### Plus

Requires an undocumented Stripe call to get user's Stripe data.

##### Subscribe

```bash
PUT https://surge.surge.sh/<domain_name>/plan
Content-Types: application/json
```

Body

| Parameter | Type     | Default | Description   |
| --------- | -------- | ------- | ------------- |
| token     | `string` | N/A     | Payment Token |

Response

```json
N/A
```

##### Subscription

```bash
GET https://surge.surge.sh/<domain_name>/subscription
Content-Types: application/json
```

Response

```json
{
  "type": "",
  "stripe_pk": "",
  "plan": {},
  "card": null,
  "perks": []
}
```

## Support

Technical support questions are best asked in the [Discussions](https://github.com/michaelmcshinsky/surgejs-sdk/discussions). We will do our best to assist as soon as possible.

If you find a defect or would like to submit a feature request, please create an [Issue](https://github.com/michaelmcshinsky/surgejs-sdk/issues) and we will investigate right away.
