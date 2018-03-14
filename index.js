"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lodash = require("lodash");
const moment = require("moment");
const randomstring = require("randomstring");
const sprintf = require('sprintf-js').sprintf;
const sha1 = require('sha1');
class APILogicError extends Error {
    constructor(title, message, httpCode, logicErrCode, ...pars) {
        super(message);
        this.title = title;
        this.message = message;
        this.httpCode = httpCode;
        this.logicErrCode = logicErrCode;
        this.pars = pars;
        this.stack = (new Error(message)).stack;
    }
    toJSON() {
        return {
            httpCode: this.httpCode,
            code: this.logicErrCode,
            title: this.title,
            message: this.message,
            pars: this.pars
        };
    }
}
exports.APILogicError = APILogicError;
class Utils {
    constructor() {
        this.randomstring = randomstring;
        this.sha1 = sha1;
        this.format = sprintf;
    }
    safe(f, callback) {
        try {
            f(callback);
        }
        catch (ex) {
            console.log(ex);
            callback(ex);
        }
    }
    logicError(title, msg, httpError, errorCode, ...pars) {
        return new APILogicError(title, msg, httpError, errorCode, ...pars);
    }
    createServiceCallback(resp) {
        return function (err, data) {
            var resData = {};
            if (data) {
                resData = JSON.parse(JSON.stringify(data));
            }
            resp.statusCode = 200;
            if (err) {
                let errObj = JSON.parse(JSON.stringify(err));
                if (errObj.message == undefined) {
                    errObj.message = err.message;
                }
                if (errObj.code == undefined) {
                    errObj.code = parseInt(err.code);
                }
                const code = err.httpCode;
                if (lodash.isNumber(code) && !lodash.isNaN(code)) {
                    resp.statusCode = code;
                }
                else {
                    resp.statusCode = 500;
                }
                resData['err'] = errObj;
            }
            resp.send(resData);
        };
    }
    isEmpty(obj) {
        return ((obj == null || lodash.isNaN(obj) || obj === false) ||
            (lodash.isString(obj) && obj.length == 0) ||
            ((obj instanceof Array) && obj.length == 0) ||
            ((obj instanceof Object) && Object.keys(obj).length == 0));
    }
    transformBySchema(src, schema) {
        for (const k in schema) {
            const f = schema[k];
            const d = lodash.get(src, k);
            if (lodash.isFunction(f)) {
                let td = d;
                try {
                    td = f(d);
                }
                catch (ex) {
                    continue;
                }
                if (td !== d) {
                    lodash.set(src, k, td);
                }
            }
        }
    }
    validBody(validator) {
        return (req, resp, next) => {
            if (!validator(req.body)) {
                resp.statusCode = 400;
                resp.send({ err: validator.errors });
                return;
            }
            next();
        };
    }
    validQuery(validator) {
        return (req, resp, next) => {
            if (!validator(req.query)) {
                resp.statusCode = 400;
                resp.send({ err: validator.errors });
                return;
            }
            next();
        };
    }
    requireQueries(...query) {
        return (req, resp, next) => {
            for (const q of query) {
                if (req.query[q] === undefined) {
                    resp.statusCode = 400;
                    resp.send({ err: `Query ${q} is missing` });
                    return;
                }
            }
            next();
        };
    }
    transformBody(schema) {
        return (req, resp, next) => {
            try {
                this.transformBySchema(req.body, schema);
            }
            catch (ex) {
            }
            finally {
                next();
            }
        };
    }
    transformQuery(schema) {
        return (req, resp, next) => {
            try {
                this.transformBySchema(req.query, schema);
            }
            catch (ex) {
            }
            finally {
                next();
            }
        };
    }
    routeAsync(reqHandler, callbackProvider) {
        return (req, resp, next) => {
            let callback = null;
            if (callbackProvider) {
                callback = callbackProvider(req, resp);
            }
            else {
                callback = this.createServiceCallback(resp);
            }
            reqHandler(req, resp, next).then((data) => {
                callback(null, data);
            }).catch((err) => {
                if (err instanceof Error) {
                    console.log(err);
                }
                callback(err);
            });
        };
    }
    routeNextableAsync(reqHandler, callbackProvider) {
        return (req, resp, next) => {
            let callback = null;
            if (callbackProvider) {
                callback = callbackProvider(req, resp);
            }
            else {
                callback = this.createServiceCallback(resp);
            }
            reqHandler(req, resp, next).then((data) => {
                if (data != undefined) {
                    callback(null, data);
                }
            }, (err) => {
                callback(err);
            });
        };
    }
    generateUpsertSQL(table, keys) {
        const updateStms = keys.map(k => `${table}.${k} = VALUES(\`${k}\`)`);
        const query = `INSERT INTO \`${table}\` (??) VALUES ? ON DUPLICATE KEY UPDATE ${updateStms.join(', ')}`;
        return query;
    }
    isValidEmailAddress(email) {
        var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return re.test(email);
    }
    get emailRegexStr() {
        return '^(([^<>()\\[\\]\\\\.,;:\\s@"]+(\\.[^<>()\\[\\]\\\\.,;:\\s@"]+)*)|(".+"))@((\\[[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}])|(([a-zA-Z\\-0-9]+\\.)+[a-zA-Z]{2,}))$';
    }
    get EarthRadius() {
        return 6378137;
    }
    geoNearOpts(dist, num = 100) {
        return {
            spherical: true,
            maxDistance: 1 / this.EarthRadius,
            distanceMultiplier: this.EarthRadius,
            num: num
        };
    }
    numKeys(obj) {
        return lodash.keys(obj).map(k => parseInt(k));
    }
    make(type, a) {
        const newA = new type();
        lodash.merge(newA, a);
        return newA;
    }
    opt(t) {
        t = { some: t };
        const that = this;
        return new Proxy(t, {
            get(receiver, name) {
                if (name === '_') {
                    return receiver.some;
                }
                else if (receiver.some === null || receiver.some === undefined) {
                    return that.opt(undefined);
                }
                else {
                    return that.opt(receiver.some[name]);
                }
            }
        });
    }
    getTimeIntFromUUID(uuid_str) {
        var uuid_arr = uuid_str.split('-'), time_str = [
            uuid_arr[2].substring(1),
            uuid_arr[1],
            uuid_arr[0]
        ].join('');
        return parseInt(time_str, 16);
    }
    ;
    getDateFromUUID(uuid_str) {
        const timeInt = this.getTimeIntFromUUID(uuid_str) - 122192928000000000;
        const miliSecsInt = Math.floor(timeInt / 10000);
        return new Date(miliSecsInt);
    }
    ;
    arrToObj(arr, keyMap, valMap) {
        return arr.reduce((ret, t) => {
            ret[keyMap(t)] = valMap(t);
            return ret;
        }, {});
    }
    pack(...arrs) {
        const n = lodash.max(arrs.map(arr => arr.length));
        const ret = [];
        for (let i = 0; i < n; ++i) {
            ret.push(arrs.map(arr => {
                if (arr.length > i) {
                    return arr[i];
                }
                return undefined;
            }));
        }
        return ret;
    }
    zipToObj(keys, fVal) {
        return keys.reduce((obj, k) => {
            obj[k] = fVal(k);
            return obj;
        }, {});
    }
    standarlize(alias) {
        let str = alias.toLowerCase();
        str = str.toLowerCase();
        str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
        str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
        str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
        str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
        str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
        str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
        str = str.replace(/đ/g, "d");
        str = str.replace(/!|@|%|\^|\*|\(|\)|\+|\=|\<|\>|\?|\/|,|\.|\:|\;|\'| |\"|\&|\#|\[|\]|~|$|_/g, " ");
        str = str.replace(/\s+\s/g, " ");
        str = str.replace(/^\s+|\s+$/g, "");
        return str;
    }
    redishmgetParse(keys, data, iterator, empty = true) {
        const dict = {};
        for (let i = 0; i < keys.length; ++i) {
            const key = keys[i];
            const val = data.length > i ? data[i] : undefined;
            if (val || empty) {
                dict[key] = val;
            }
        }
        return lodash.mapValues(dict, iterator);
    }
    arr(from, to) {
        const arr = [];
        for (let i = from; i < to; ++i) {
            arr.push(i);
        }
        return arr;
    }
    pair(s1, s2) {
        return new Pair(s1, s2);
    }
    pairFirst(s, sep = "|", f = (s) => { return s; }) {
        return f(s.split(sep)[0]);
    }
    pairSecond(s, sep = "|", f = (s) => { return s; }) {
        return f(s.split(sep)[1]);
    }
    validDate(str, fmt, errCode) {
        if (!moment(str, fmt).isValid()) {
            throw this.logicError('Invalid date format', `Date string ${str} is not valid`, errCode, 400, str);
        }
    }
    parseIntNull(v) {
        const i = lodash.parseInt(v);
        return isNaN(i) ? null : (i || null);
    }
    parseFloatNull(v) {
        const f = parseFloat(v);
        return isNaN(f) ? null : (f || null);
    }
}
;
class Pair {
    constructor(p1, p2) {
        this.toString = (sep) => {
            return this.str();
        };
        this._1 = p1;
        this._2 = p2;
    }
    str(sep = '|') {
        const s1 = lodash.isString(this._1) ? this._1 : (lodash.isNumber(this._1) ? this._1.toString() : JSON.stringify(this._1));
        const s2 = lodash.isString(this._2) ? this._2 : (lodash.isNumber(this._2) ? this._2.toString() : JSON.stringify(this._2));
        return [s1, s2].join(sep);
    }
}
exports.Pair = Pair;
;
exports._ = new Utils();
lodash.merge(exports._, lodash);
exports.default = exports._;
//# sourceMappingURL=index.js.map