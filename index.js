'use strict';

const TEST_REGEX = /^\$|\./;
const TEST_REGEX_WITHOUT_DOT = /^\$/;
const REPLACE_REGEX = /^\$|\./g;

function isPlainObject(obj) {
  return typeof obj === 'object' && obj !== null;
}

function getTestRegex(allowDots) {
  return allowDots ? TEST_REGEX_WITHOUT_DOT : TEST_REGEX;
}

function withEach(target, cb) {
  (function act(obj) {
    if (Array.isArray(obj)) {
      obj.forEach(act);
    } else if (isPlainObject(obj)) {
      Object.keys(obj).forEach(function (key) {
        const val = obj[key];
        const resp = cb(obj, val, key);
        if (resp.shouldRecurse) {
          act(obj[resp.key || key]);
        }
      });
    }
  })(target);
}

function has(target, allowDots) {
  const regex = getTestRegex(allowDots);

  let hasProhibited = false;
  withEach(target, function (obj, val, key) {
    if (regex.test(key)) {
      hasProhibited = true;
      return { shouldRecurse: false };
    } else {
      return { shouldRecurse: true };
    }
  });

  return hasProhibited;
}

function _sanitize(target, parent, options) {
  const regex = getTestRegex(options.allowDots);

  let isSanitized = false;
  let replaceWith = null;
  const dryRun = Boolean(options.dryRun);
  const allowList = options.allowList || [];
  if (!regex.test(options.replaceWith) && options.replaceWith !== '.') {
    replaceWith = options.replaceWith;
  }

  withEach(target, function (obj, val, key) {
    let shouldRecurse = true;

    const fullPath = parent ? `${parent}.${key}` : key;

    if (allowList.includes(fullPath)) {
      return {
        shouldRecurse: shouldRecurse,
        key: key,
      };
    }

    if (regex.test(key)) {
      isSanitized = true;
      // if dryRun is enabled, do not modify the target
      if (dryRun) {
        return {
          shouldRecurse: shouldRecurse,
          key: key,
        };
      }
      delete obj[key];
      if (replaceWith) {
        key = key.replace(REPLACE_REGEX, replaceWith);
        // Avoid to set __proto__ and constructor.prototype
        // https://portswigger.net/daily-swig/prototype-pollution-the-dangerous-and-underrated-vulnerability-impacting-javascript-applications
        // https://snyk.io/vuln/SNYK-JS-LODASH-73638
        if (
          key !== '__proto__' &&
          key !== 'constructor' &&
          key !== 'prototype'
        ) {
          obj[key] = val;
        }
      } else {
        shouldRecurse = false;
      }
    }

    return {
      shouldRecurse: shouldRecurse,
      key: key,
    };
  });

  return {
    isSanitized,
    target,
  };
}

function sanitize(target, parent, options = {}) {
  return _sanitize(target, parent, options).target;
}

/**
 * @param {{replaceWith?: string, onSanitize?: function, dryRun?: boolean, allowList?: []string}} options
 * @returns {function}
 */
function middleware(options = {}) {
  const hasOnSanitize = typeof options.onSanitize === 'function';
  return function (req, res, next) {
    ['body', 'params', 'headers', 'query'].forEach(function (key) {
      if (req[key]) {
        const { target, isSanitized } = _sanitize(req[key], key, options);
        req[key] = target;
        if (isSanitized && hasOnSanitize) {
          options.onSanitize({
            req,
            key,
          });
        }
      }
    });
    next();
  };
}

module.exports = middleware;
module.exports.sanitize = sanitize;
module.exports.has = has;
