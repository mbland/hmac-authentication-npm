# hmac-authentication npm

Signs and authenticates HTTP requests based on a shared-secret HMAC signature.

Developed in parallel with the following packages for other languages:
- Go: [github.com/mbland/hmacauth](https://github.com/mbland/hmacauth/)
- Python: [hmac_authentication](https://github.com/mbland/hmac_authentication_py)
- Ruby: [hmac_authentication](https://github.com/mbland/hmac_authentication_gem)

## Installation

```sh
$ npm install hmac-authentication --save
```

## Authenticating incoming requests

Assuming you're using [Express](https://www.npmjs.com/package/express), during
initialization of your application, where `config.signatureHeader` identifies
the header containing the message signature, `config.headers` is a list of
headers factored into the signature, and `config.secretKey` is the shared
secret between your application and the service making the request:

```js
var express = require('express');
var bodyParser = require('bodyParser');
var HmacAuth = require('hmac-authentication');
var config = require('./config.json');

function doLaunch(config) {
  var middlewareOptions = {
    verify: HmacAuth.middlewareAuthenticator(
      config.secretKey, config.signatureHeader, config.headers)
  };
  var server = express();
  server.use(bodyParser.raw(middlewareOptions));

  // Continue server initialization...
}
```

If you're not using Express, you can use something similar to the following:

```js
var HmacAuth = require('hmac-authentication');
var config = require('./config.json');

// When only used for authentication, it doesn't matter what the first
// argument is, because the hash algorithm used for authentication will be
// parsed from the incoming request signature header.
var auth = new HmacAuth(
  'sha1', config.secretKey, config.signatureHeader, config.headers);

// rawBody must be a string.
function requestHandler(req, rawBody) {
  var authenticationResult = auth.authenticateRequest(req, rawBody);

  if (authenticationResult[0] != HmacAuth.MATCH) {
    // Handle authentication failure...
  }
}
```

## Signing outgoing requests

Do something similar to the following. `rawBody` must be a string.

```js
var HmacAuth = require('hmac-authentication');
var config = require('./config.json');

var auth = new HmacAuth(
  config.digestName, config.secretKey, config.signatureHeader, config.headers);

function makeRequest(req, rawBody) {
  // Prepare request...
  auth.signRequest(req, rawBody);
}
```
