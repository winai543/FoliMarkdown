"use strict";
(function (root, factory) {
  const register = factory();
  if (typeof module === "object" && module.exports) module.exports = register;
  else root.registerFoliMarkdownFormatters = register;
})(globalThis, function () {
  const text = value => value == null ? "" : String(value);
  const numeric = value => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string" || !value.trim()) return null;
    const result = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(result) ? result : null;
  };
  const isOptions = value => !!value && typeof value === "object" && value.hash && typeof value.lookupProperty === "function";
  const argsAndOptions = args => {
    const options = isOptions(args.at(-1)) ? args.pop() : { hash: {} };
    return { args, hash: options.hash || {} };
  };
  const localeOption = (positional, hash, index = 0) => hash.locale || (typeof positional[index] === "string" ? positional[index] : undefined);
  const numberOptions = hash => {
    const { locale, currency, ...options } = hash;
    return options;
  };
  const formatNumberValue = (value, positional = [], hash = {}) => {
    const number = numeric(value);
    if (number == null) return text(value);
    try { return new Intl.NumberFormat(localeOption(positional, hash), numberOptions(hash)).format(number); }
    catch { return text(value); }
  };
  const formatCurrencyValue = (value, positional = [], hash = {}) => {
    const number = numeric(value);
    if (number == null) return text(value);
    const currency = hash.currency || (typeof positional[0] === "string" ? positional[0] : "THB");
    try { return new Intl.NumberFormat(localeOption(positional, hash, 1), { ...numberOptions(hash), style: "currency", currency }).format(number); }
    catch { return text(value); }
  };
  const formatDateValue = (value, positional = [], hash = {}) => {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return text(value);
    const style = hash.style || (typeof positional[0] === "string" ? positional[0] : "medium");
    const locale = localeOption(positional, hash, 1);
    const { locale: _locale, style: _style, ...rest } = hash;
    try { return new Intl.DateTimeFormat(locale, { dateStyle: style, ...rest }).format(date); }
    catch { return text(value); }
  };
  const formatTimeValue = (value, positional = [], hash = {}) => {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return text(value);
    const style = hash.style || (typeof positional[0] === "string" ? positional[0] : "short");
    const locale = localeOption(positional, hash, 1);
    const { locale: _locale, style: _style, ...rest } = hash;
    try { return new Intl.DateTimeFormat(locale, { timeStyle: style, ...rest }).format(date); }
    catch { return text(value); }
  };
  const formatPercentValue = (value, positional = [], hash = {}) => {
    const number = numeric(value);
    if (number == null) return text(value);
    try { return new Intl.NumberFormat(localeOption(positional, hash), { ...numberOptions(hash), style: "percent" }).format(number); }
    catch { return text(value); }
  };
  const formatValue = (value, kind, args, hash) => {
    switch (String(kind || "").toLowerCase()) {
      case "number": return formatNumberValue(value, args, hash);
      case "currency": return formatCurrencyValue(value, args, hash);
      case "date": return formatDateValue(value, args, hash);
      case "time": return formatTimeValue(value, args, hash);
      case "percent": return formatPercentValue(value, args, hash);
      default: return text(value);
    }
  };

  const formulaNumber = value => numeric(value);
  const formulaArgs = rawArgs => {
    const { args } = argsAndOptions(rawArgs);
    return args.flatMap(value => Array.isArray(value) ? value : [value]).map(formulaNumber).filter(value => value !== null);
  };
  const formulaResult = value => Number.isFinite(value) ? value : "";

  function evaluateLoliScript(source, root, context, userFunctions = {}, depth = 0) {
    if (depth > 12) throw new Error("Loli function nesting is too deep.");
    if (typeof source !== "string" || source.length > 2000) throw new Error("Loli Script expects an expression under 2,000 characters.");
    const tokens = [];
    const pattern = /\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|===|!==|==|!=|<=|>=|&&|\|\||\*\*|[A-Za-z_$][\w$]*|[(),+\-*/%!<>.]/gy;
    let offset = 0, match;
    while (offset < source.length) {
      pattern.lastIndex = offset;
      match = pattern.exec(source);
      if (!match) throw new Error(`Unsupported Loli Script syntax near: ${source.slice(offset, offset + 20)}`);
      offset = pattern.lastIndex;
      if (!/^\s+$/.test(match[0])) tokens.push(match[0]);
    }
    let index = 0;
    const peek = () => tokens[index];
    const take = () => tokens[index++];
    const safeKey = key => !["__proto__", "prototype", "constructor"].includes(key);
    const getPath = (base, path) => path.reduce((value, key) => value && safeKey(key) && Object.hasOwn(Object(value), key) ? value[key] : undefined, base);
    const functions = {
      abs: values => Math.abs(Number(values[0])), ceil: values => Math.ceil(Number(values[0])),
      floor: values => Math.floor(Number(values[0])), round: values => {
        const digits = Math.max(-100, Math.min(100, Math.trunc(Number(values[1]) || 0)));
        const factor = 10 ** digits;
        return Math.round((Number(values[0]) + Math.sign(Number(values[0])) * Number.EPSILON) * factor) / factor;
      },
      min: values => Math.min(...values.map(Number)), max: values => Math.max(...values.map(Number)),
      sum: values => (Array.isArray(values[0]) ? values[0] : values).reduce((total, value) => total + Number(value || 0), 0),
      average: values => {
        const list = Array.isArray(values[0]) ? values[0] : values;
        return list.length ? list.reduce((total, value) => total + Number(value), 0) / list.length : "";
      },
      percent: values => Number(values[0]) * Number(values[1]) / 100
    };
    const precedence = { "||": 1, "&&": 2, "==": 3, "===": 3, "!=": 3, "!==": 3, "<": 4, "<=": 4, ">": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6, "**": 7 };
    function primary() {
      const token = take();
      if (token === undefined) throw new Error("Unexpected end of Loli Script expression.");
      if (token === "!" || token === "+" || token === "-") {
        const value = primary();
        return token === "!" ? !value : token === "+" ? Number(value) : -Number(value);
      }
      if (token === "(") {
        const value = expression(0);
        if (take() !== ")") throw new Error("Missing closing parenthesis in Loli Script.");
        return value;
      }
      if (/^(?:\d|\.)/.test(token)) return Number(token);
      if (token[0] === '"') return JSON.parse(token);
      if (token[0] === "'") return token.slice(1, -1).replace(/\\(['\\])/g, "$1");
      if (token === "true") return true;
      if (token === "false") return false;
      if (token === "null") return null;
      if (!/^[A-Za-z_$][\w$]*$/.test(token)) throw new Error(`Unexpected token in Loli Script: ${token}`);
      if (peek() === "(") {
        take();
        const args = [];
        if (peek() !== ")") {
          do { args.push(expression(0)); if (peek() !== ",") break; take(); } while (true);
        }
        if (take() !== ")") throw new Error("Missing closing parenthesis in Loli Script function.");
        if (Object.hasOwn(functions, token)) return functions[token](args);
        const definition = userFunctions && Object.hasOwn(userFunctions, token) ? userFunctions[token] : null;
        if (!definition || !Array.isArray(definition.params) || typeof definition.expression !== "string") throw new Error(`Loli Script function is not allowed: ${token}`);
        const scope = Object.create(null);
        if (context && typeof context === "object") for (const key of Object.keys(context)) if (safeKey(key)) scope[key] = context[key];
        definition.params.forEach((name, position) => { if (safeKey(name)) scope[name] = args[position]; });
        return evaluateLoliScript(definition.expression, root, scope, userFunctions, depth + 1);
      }
      const path = [token];
      while (peek() === ".") {
        take();
        const part = take();
        if (!/^[A-Za-z_$][\w$]*$/.test(part || "") || !safeKey(part)) throw new Error("Unsupported property path in Loli Script.");
        path.push(part);
      }
      if (path[0] === "this") return getPath(context, path.slice(1));
      return getPath(context, path) ?? getPath(root, path);
    }
    function expression(minimum) {
      let left = primary();
      while (precedence[peek()] >= minimum && precedence[peek()] !== undefined) {
        const operator = take();
        const priority = precedence[operator];
        const right = expression(priority + (operator === "**" ? 0 : 1));
        switch (operator) {
          case "+": left = typeof left === "string" || typeof right === "string" ? String(left ?? "") + String(right ?? "") : Number(left) + Number(right); break;
          case "-": left = Number(left) - Number(right); break;
          case "*": left = Number(left) * Number(right); break;
          case "/": left = Number(right) === 0 ? "" : Number(left) / Number(right); break;
          case "%": left = Number(right) === 0 ? "" : Number(left) % Number(right); break;
          case "**": left = Number(left) ** Number(right); break;
          case "==": case "===": left = left === right; break;
          case "!=": case "!==": left = left !== right; break;
          case "<": left = left < right; break;
          case "<=": left = left <= right; break;
          case ">": left = left > right; break;
          case ">=": left = left >= right; break;
          case "&&": left = left && right; break;
          case "||": left = left || right; break;
        }
      }
      return left;
    }
    const result = expression(0);
    if (index !== tokens.length) throw new Error(`Unexpected token in Loli Script: ${peek()}`);
    return typeof result === "number" && !Number.isFinite(result) ? "" : result;
  }

  const registerFoliMarkdownFormatters = function (Handlebars) {
    Handlebars.registerHelper("loli", function (source, options) {
      if (!isOptions(options)) throw new Error("Use Loli Script as {{loli \"expression\"}}.");
      return evaluateLoliScript(source, options.data?.root || this, this, globalThis.foliLoliFunctions || {});
    });
    const formulas = {
      add: values => values.length ? values.reduce((total, value) => total + value, 0) : 0,
      sum: values => values.reduce((total, value) => total + value, 0),
      subtract: values => values.length >= 2 ? values.slice(1).reduce((total, value) => total - value, values[0]) : "",
      multiply: values => values.length ? values.reduce((total, value) => total * value, 1) : 0,
      divide: values => values.length >= 2 && values.slice(1).every(value => value !== 0) ? values.slice(1).reduce((total, value) => total / value, values[0]) : "",
      average: values => values.length ? values.reduce((total, value) => total + value, 0) / values.length : "",
      min: values => values.length ? Math.min(...values) : "",
      max: values => values.length ? Math.max(...values) : "",
      round: values => {
        if (!values.length) return "";
        const digits = Math.max(-100, Math.min(100, Math.trunc(values[1] || 0)));
        const factor = 10 ** digits;
        return Math.round((values[0] + Math.sign(values[0]) * Number.EPSILON) * factor) / factor;
      },
      ceil: values => values.length ? Math.ceil(values[0]) : "",
      floor: values => values.length ? Math.floor(values[0]) : "",
      abs: values => values.length ? Math.abs(values[0]) : "",
      power: values => values.length >= 2 ? Math.pow(values[0], values[1]) : "",
      mod: values => values.length >= 2 && values[1] !== 0 ? values[0] % values[1] : "",
      percent: values => values.length >= 2 ? values[0] * values[1] / 100 : ""
    };
    for (const [name, calculate] of Object.entries(formulas)) {
      Handlebars.registerHelper(name, (...rawArgs) => formulaResult(calculate(formulaArgs(rawArgs))));
    }
    Handlebars.registerHelper("formatNumber", (value, ...rawArgs) => {
      const { args, hash } = argsAndOptions(rawArgs);
      return formatNumberValue(value, args, hash);
    });
    Handlebars.registerHelper("formatCurrency", (value, ...rawArgs) => {
      const { args, hash } = argsAndOptions(rawArgs);
      return formatCurrencyValue(value, args, hash);
    });
    Handlebars.registerHelper("formatDate", (value, ...rawArgs) => {
      const { args, hash } = argsAndOptions(rawArgs);
      return formatDateValue(value, args, hash);
    });
    Handlebars.registerHelper("formatTime", (value, ...rawArgs) => {
      const { args, hash } = argsAndOptions(rawArgs);
      return formatTimeValue(value, args, hash);
    });
    Handlebars.registerHelper("formatPercent", (value, ...rawArgs) => {
      const { args, hash } = argsAndOptions(rawArgs);
      return formatPercentValue(value, args, hash);
    });
    Handlebars.registerHelper("format", (value, kind, ...rawArgs) => {
      const { args, hash } = argsAndOptions(rawArgs);
      return formatValue(value, kind, args, hash);
    });
    Handlebars.registerHelper("uppercase", (value, ...rawArgs) => {
      const { args, hash } = argsAndOptions(rawArgs);
      const locale = localeOption(args, hash);
      try { return locale ? text(value).toLocaleUpperCase(locale) : text(value).toUpperCase(); }
      catch { return text(value).toUpperCase(); }
    });
    Handlebars.registerHelper("lowercase", (value, ...rawArgs) => {
      const { args, hash } = argsAndOptions(rawArgs);
      const locale = localeOption(args, hash);
      try { return locale ? text(value).toLocaleLowerCase(locale) : text(value).toLowerCase(); }
      catch { return text(value).toLowerCase(); }
    });
    Handlebars.registerHelper("capitalize", value => {
      const valueText = text(value);
      return valueText ? valueText[0].toLocaleUpperCase() + valueText.slice(1) : "";
    });
    Handlebars.registerHelper("join", (values, separator, options) => {
      if (!Array.isArray(values)) return text(values);
      const joiner = isOptions(separator) ? ", " : text(separator ?? ", ");
      return values.map(text).join(joiner);
    });
    Handlebars.registerHelper("default", (value, fallback, options) => {
      const actualFallback = isOptions(fallback) ? "" : fallback;
      return value == null || value === "" ? text(actualFallback) : text(value);
    });
  };
  registerFoliMarkdownFormatters.evaluateLoliScript = evaluateLoliScript;
  return registerFoliMarkdownFormatters;
});
