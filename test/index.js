/* jshint node: true */
/* jshint expr: true */
/* jshint mocha: true */
'use strict';

var chai = require('chai');
var httpMocks = require('node-mocks-http');
var HmacAuth = require('../index');

var expect = chai.expect;
chai.should();

describe('HmacAuthentication', function() {
  // These correspond to the headers used in bitly/oauth2_proxy#147.
  var HEADERS = [
    'Content-Length',
    'Content-Md5',
    'Content-Type',
    'Date',
    'Authorization',
    'X-Forwarded-User',
    'X-Forwarded-Email',
    'X-Forwarded-Access-Token',
    'Cookie',
    'Gap-Auth'
  ];

  var auth = new HmacAuth('sha1', 'foobar', 'GAP-Signature', HEADERS);

  describe('resultCodeToString', function() {
    it('should return undefined for out-of-range values', function() {
      expect(HmacAuth.resultCodeToString(0)).to.be.undefined;
      expect(HmacAuth.resultCodeToString(6)).to.be.undefined;
    });

    it('should return the correct matching strings', function() {
      expect(HmacAuth.resultCodeToString(HmacAuth.NO_SIGNATURE))
        .to.eql('NO_SIGNATURE');
      expect(HmacAuth.resultCodeToString(HmacAuth.INVALID_FORMAT))
        .to.eql('INVALID_FORMAT');
      expect(HmacAuth.resultCodeToString(HmacAuth.UNSUPPORTED_ALGORITHM))
        .to.eql('UNSUPPORTED_ALGORITHM');
      expect(HmacAuth.resultCodeToString(HmacAuth.MATCH))
        .to.eql('MATCH');
      expect(HmacAuth.resultCodeToString(HmacAuth.MISMATCH))
        .to.eql('MISMATCH');
    });
  });

  describe('stringToSign and requestSignature', function() {
    it('should correctly sign a POST request', function() {
      var payload = '{ "hello": "world!" }';
      var httpOptions = {
        method: 'POST',
        url: '/foo/bar',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length,
          'Content-MD5': 'deadbeef',
          'Date': '2015-09-28',
          'Authorization': 'trust me',
          'X-Forwarded-User': 'mbland',
          'X-Forwarded-Email': 'mbland@acm.org',
          'X-Forwarded-Access-Token': 'feedbead',
          'Cookie': 'foo; bar; baz=quux',
          'Gap-Auth': 'mbland'
        }
      };
      var req = httpMocks.createRequest(httpOptions);

      expect(auth.stringToSign(req)).to.eql(
        ['POST',
         payload.length.toString(),
         'deadbeef',
         'application/json',
         '2015-09-28',
         'trust me',
         'mbland',
         'mbland@acm.org',
         'feedbead',
         'foo; bar; baz=quux',
         'mbland',
         '/foo/bar'
        ].join('\n'));
      expect(auth.requestSignature(req, payload))
        .to.eql('sha1 722UbRYfC6MnjtIxqEJMDPrW2mk=');
    });

    it('should correctly sign a GET request with a complete URL', function() {
      var httpOptions = {
        method: 'GET',
        url: 'http://localhost/foo/bar?baz=quux#xyzzy',
        headers: {
          'Date': '2015-09-29',
          'Cookie': 'foo; bar; baz=quux',
          'Gap-Auth': 'mbland'
        }
      };
      var req = httpMocks.createRequest(httpOptions);

      expect(auth.stringToSign(req)).to.eql(
        ['GET',
         '',
         '',
         '',
         '2015-09-29',
         '',
         '',
         '',
         '',
         'foo; bar; baz=quux',
         'mbland',
         '/foo/bar?baz=quux#xyzzy'
        ].join('\n'));
      expect(auth.requestSignature(req, undefined))
        .to.eql('sha1 gw1nuRYzkocv5q8nQSo3pT5F970=');
    });

    it('should correctly sign a GET w/ multiple values for header', function() {
      var httpOptions = {
        method: 'GET',
        url: '/foo/bar',
        headers: {
          'Date': '2015-09-29',
          'Cookie': ['foo', 'bar', 'baz=quux'],
          'Gap-Auth': 'mbland'
        }
      };
      var req = httpMocks.createRequest(httpOptions);

      expect(auth.stringToSign(req)).to.eql(
        ['GET',
         '',
         '',
         '',
         '2015-09-29',
         '',
         '',
         '',
         '',
         'foo,bar,baz=quux',
         'mbland',
         '/foo/bar'
        ].join('\n'));
      expect(auth.requestSignature(req, undefined))
        .to.eql('sha1 VnoxQC+mg2Oils+Cbz1j1c9LXLE=');
    });
  });

  describe('validateRequest and middlewareValidator', function() {
    var createRequest = function(headerSignature) {
      var httpOptions = {
        method: 'GET',
        url: '/foo/bar',
        headers: {
          'Date': '2015-09-29',
          'Cookie': 'foo; bar; baz=quux',
          'Gap-Auth': 'mbland'
        }
      };
      if (headerSignature) {
        httpOptions.headers['Gap-Signature'] = headerSignature;
      }
      return httpMocks.createRequest(httpOptions);
    };

    var validateRequest = function(request, secretKey) {
      var validate = HmacAuth.middlewareValidator(
        secretKey, 'Gap-Signature', HEADERS);
      validate(request, undefined, new Buffer(0), 'utf-8');
    };

    it('should throw ValidationError with NO_SIGNATURE', function() {
      var f = function() { validateRequest(createRequest(), 'foobar'); };
      expect(f).to.throw(HmacAuth.ValidationError, 'failed: NO_SIGNATURE');
    });

    it('should throw ValidationError with INVALID_FORMAT', function() {
      var badValue = 'should be algorithm and digest value';
      var f = function() {
        var request = createRequest(badValue); 
        validateRequest(request, 'foobar');
      };
      expect(f).to.throw(
        HmacAuth.ValidationError,
        'failed: INVALID_FORMAT header: "' + badValue + '"');
    });

    it('should throw ValidationError with UNSUPPORTED_ALGORITHM', function() {
      var request = createRequest();
      var validSignature = auth.requestSignature(request, null);
      var components = validSignature.split(' ');
      var signatureWithUnsupportedAlgorithm = 'unsupported ' + components[1];

      var f = function() {
        validateRequest(
          createRequest(signatureWithUnsupportedAlgorithm), 'foobar');
      };
      expect(f).to.throw(
        HmacAuth.ValidationError,
        'failed: UNSUPPORTED_ALGORITHM ' +
        'header: "' + signatureWithUnsupportedAlgorithm + '"');
    });

    it('should validate the request with MATCH', function() {
      var request = createRequest();
      var expectedSignature = auth.requestSignature(request, null);
      auth.signRequest(request);
      validateRequest(request, 'foobar');

      // If we reach this point the result was a MATCH. Call
      // auth.validateRequest() directly so we can inspect the values.
      var results = auth.validateRequest(request, undefined);
      var result = results[0];
      var header = results[1];
      var computed = results[2];

      expect(result).to.eql(HmacAuth.MATCH);
      expect(header).to.eql(expectedSignature);
      expect(computed).to.eql(expectedSignature);
    });

    it('should throw ValidationError with MISMATCH', function() {
      var request = createRequest();
      var foobarSignature = auth.requestSignature(request, null);
      var barbazAuth = new HmacAuth('sha1', 'barbaz', 'Gap-Signature', HEADERS);
      var barbazSignature = barbazAuth.requestSignature(request, null);

      var f = function() {
        validateRequest(createRequest(foobarSignature), 'barbaz');
      };
      expect(f).to.throw(
        HmacAuth.ValidationError,
        'failed: MISMATCH ' +
        'header: "' + foobarSignature + '" ' +
        'computed: "' + barbazSignature + '"');
    });
  });
});
