"use strict";

const { test } = require("node:test");
const assert = require("assert");

/**
 * Create a new test request instance.
 * @param {string} baseURL - The base URL of the API server.
 * @param {Object} [context={}] - Optional shared context object for managing state like cookies.
 * @returns {TestRequest}
 */
function request(baseURL, context = {}) {
  return new TestRequest(baseURL, context);
}

class TestRequest {
  constructor(baseURL, context = {}) {
    this.baseURL = baseURL;
    this.context = context;
    this.method = "GET";
    this.path = "/";
    this.queryParams = "";
    this.body = null;
    this.headers = {};
    this.assertions = [];
  }

  get(path) {
    this.method = "GET";
    this.path = path;
    this.body = null; // ensure no body
    return this;
  }

  post(path, body) {
    this._setMethodAndBody("POST", path, body);
    return this;
  }

  put(path, body) {
    this._setMethodAndBody("PUT", path, body);
    return this;
  }

  patch(path, body) {
    this._setMethodAndBody("PATCH", path, body);
    return this;
  }

  delete(path) {
    this.method = "DELETE";
    this.path = path;
    this.body = null;
    return this;
  }

  _setMethodAndBody(method, path, body) {
    this.method = method;
    this.path = path;

    if (typeof body === "string") {
      this.body = body;
    } else if (body !== undefined) {
      this.body = JSON.stringify(body);
      this.headers["Content-Type"] = "application/json";
    } else {
      this.body = null;
    }
  }

  query(params) {
    const str = new URLSearchParams(params).toString();
    this.queryParams += (this.queryParams ? "&" : "?") + str;
    return this;
  }

  send(body) {
    if (typeof body === "string") {
      this.body = body;
    } else {
      this.body = JSON.stringify(body);
      this.headers["Content-Type"] = "application/json";
    }
    return this;
  }

  setHeader(key, value) {
    this.headers[key] = value;
    return this;
  }

  sendCookieFromContext() {
    if (this.context.cookie) {
      this.headers["Cookie"] = this.context.cookie;
    }
    return this;
  }

  expectStatus(code) {
    this.assertions.push(async res => {
      if (res.status !== code) {
        throw new Error(`Expected status ${code}, got ${res.status}`);
      }
    });
    return this;
  }

  expectHeader(key, expected, exact = true) {
    this.assertions.push(async res => {
      const actual = res.headers.get(key);
      const match = exact ? actual === expected : actual?.includes(expected);
      if (!match) {
        throw new Error(
          `Expected header '${key}' ${
            exact ? "=" : "to include"
          } '${expected}', got '${actual}'`
        );
      }
    });
    return this;
  }

  expectBodyField(key, expected) {
    this.assertions.push(async (res, json) => {
      if (!(key in json)) {
        throw new Error(`Expected body to have key '${key}'`);
      }
      if (expected !== undefined && json[key] !== expected) {
        throw new Error(
          `Expected body['${key}'] = '${expected}', got '${json[key]}'`
        );
      }
    });
    return this;
  }

  expectBodyEquals(expected) {
    this.assertions.push(async (res, json) => {
      const actualStr = JSON.stringify(json);
      const expectedStr = JSON.stringify(expected);
      if (actualStr !== expectedStr) {
        throw new Error(
          `Expected full body to equal:\n${expectedStr}\nBut got:\n${actualStr}`
        );
      }
    });
    return this;
  }

  expectTextBody(expectedText) {
    this.assertions.push(async res => {
      const text = await res.text();
      if (text !== expectedText) {
        throw new Error(
          `Expected text body to equal:\n${expectedText}\nBut got:\n${text}`
        );
      }
    });
    return this;
  }

  expect(fn) {
    this.assertions.push(fn);
    return this;
  }

  saveBodyFieldToContext(bodyKey, contextKey) {
    this.assertions.push(async (res, json) => {
      this.context[contextKey] = json[bodyKey];
    });
    return this;
  }

  saveCookieFromResponse(cookieName) {
    this.assertions.push(async res => {
      const setCookie = res.headers.get("set-cookie");
      if (!setCookie) return;
      const match = setCookie
        .split(/,(?=\s*\w+=)/)
        .find(c => c.trim().startsWith(`${cookieName}=`));
      if (match) {
        this.context.cookie = match.split(";")[0];
      }
    });
    return this;
  }

  /**
   * Executes the request and applies assertions.
   * @param {boolean} [showDetails=false]
   * @returns {Promise<{ res: Response, json: Object, context: Object }>}
   */
  async run(showDetails = false) {
    const url = `${this.baseURL}${this.path}${this.queryParams}`;

    const requestOptions = {
      method: this.method,
      headers: this.headers,
      body: ["GET", "HEAD"].includes(this.method) ? undefined : this.body,
    };

    if (showDetails) {
      console.log("\n===== REQUEST =====");
      console.log(`${this.method} ${url}`);
      console.log("Headers:", this.headers);
      if (this.body) {
        console.log("Body:", this.body);
      }
    }

    let res;
    try {
      res = await fetch(url, requestOptions);
    } catch (err) {
      throw new Error(`Fetch failed: ${err.message}`);
    }

    let json = {};
    let text = "";

    try {
      const clone = res.clone();
      const contentType = res.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        json = await clone.json();
      } else {
        text = await clone.text();
      }
    } catch (err) {
      text = "<unreadable>";
    }

    if (showDetails) {
      console.log("===== RESPONSE =====");
      console.log("Status:", res.status);
      console.log("Headers:", Object.fromEntries(res.headers.entries()));
      if (Object.keys(json).length > 0) {
        console.log("JSON Body:", json);
      } else {
        console.log("Text Body:", text);
      }
    }

    for (const assertFn of this.assertions) {
      await assertFn(res, json);
    }

    return { res, json, context: this.context };
  }
}

// Aliases
const describe = test.describe;
const it = test;

module.exports = {
  request,
  test,
  describe,
  it,
  assert,
};
