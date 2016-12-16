var ws     = require("nodejs-websocket");   // npm install nodejs-websocket
var mysql  = require('mysql');              // npm install mysql
var crypto = require('crypto');             // npm install crypto

/*
 * Messageserver(json, json)
 */
function Messageserver(dbConfig, websocketConfig, serverConfig)
{
    this.userlist = {};
    this.authTimeout = isType("number", serverConfig.authTimeout) ?
        serverConfig.authTimeout : 3600;
    this.dbConnection = mysql.createConnection(dbConfig);

    this.websocketServer = ws.
        createServer(this.onWebsocketConnect).
        listen(websocketConfig.websocketPort);
}

/* 
 * setHeader(json, json, function)
 * Setzt die HTTP Header, sodass von jeder Domäne aus das Webservice aufgerufen werden kann.
 * Weiters wird der Content Type der Antwort auf JSON gesetzt.
 */
Messageserver.prototype.setHeader = function (req, res, next) {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
};

/*
 * onWebsocketConnect(json)
 * Wird aufgerufen, wenn eine Verbindung vom Client zum Socketserver aufgebaut wurde.
 * Wenn der Client nicht den richtigen Pfad verwendet (ws://..../tetra), dann wird
 * die Verbindung sofort wieder geschlossen.
 *
 * conn: Das Connection Objekt der Verbindung.
 */
Messageserver.prototype.onWebsocketConnect = function(conn) {
    if (conn.path !== "/chatserver") {
        conn.close();
        return;
    }
    Messageserver.logger.show("Websocket client connected: " + conn.headers.origin);
};

/*
 * getMessages
 * Liest alle Datensätze aus der messages Tabelle.
 */
Messageserver.prototype.getMessages = function (onSuccess, onError) {
    try {
        this.dbConnection.query('SELECT * FROM messages ORDER BY M_Created',
            function (err, rows, fields) {
            if (err !== null) {
                if (typeof onError === "function") onError(err)
                return;
            }
            if (typeof onSuccess === "function") onSuccess(rows);
        });
    }
    catch (err) {
        if (typeof onError === "function") onError(err)
    }
};

/*
 * sendMessageToAll(string, function, function)
 * Sendet allen verbundenen Clients die in messageStr enthaltene Nachricht. Weiters wird der String
 * in die Tabelle messages geschrieben.
 */
Messageserver.prototype.sendMessageToAll = function (messageStr, onSuccess, onError) {
    try {
        this.dbConnection.query("INSERT INTO messages SET ?", { M_Message: messageStr });
        this.websocketServer.connections.forEach(function (conn) {
            try {
                conn.sendText(messageStr);
            }
            catch (err) {
                if (typeof onError === "function") onError();
            }
        });
    if (typeof onSuccess === "function") onSuccess();
    }
    catch (err) {
        if (typeof onError === "function") onError();
    }
};

/*
 * checkCredentials(json, json, function)
 * Prüft den übergebenen Token. Wenn dieser gültig ist, dann wird die nächste Methode des Routings
 * aufgerufen. Ist der Token ungültig, wird {error: string} gesendet, wobei der String 
 * "MISSING_TOKEN", "INVALID_TOKEN",  "NOT_AUTH", "AUTH_TIMEOUT" oder "INVALID_CREDENTIALS" 
 * sein kann.
 * POST Parameter: token
 */

    Messageserver.prototype.checkCredentials = function (req, res, next) {
    try
    {
        /* POST Parameter token überhaupt übermittelt? */
        if (!isType("string", req.body.token)) {
            throw "MISSING_TOKEN";
        }

        var tokenDecoded = new Buffer(req.body.token, 'base64').toString('utf8').split(":");
        if (tokenDecoded.length != 2) {
            throw "INVALID_TOKEN";
        }
        /* Ist der User in unserer Userlist? */
        var userinfo = this.userlist[tokenDecoded[0]];
        if (!isType("object", userinfo)) {
            throw "NOT_AUTH";
        }
        /* 
         * Stimmt der Hashwert von IP, Useragent und Secret, wenn wir ihn neu generieren, 
         * mit dem übermittelten überein und ist er auch nicht abgelaufen? 
         */
        var toHash = req.headers["user-agent"] +
                     req.connection.remoteAddress +
                     userinfo.secret;
        var hashed = crypto.createHmac('sha256', userinfo.secret)
                           .update(toHash)
                           .digest('base64');
        /* Ist der Token abgelaufen? */
        if (new Date().valueOf() - this.authTimeout * 1000 > userinfo.lastActivity) {
            throw "AUTH_TIMEOUT";
        }
        /* Stimmt der Hashwert noch? */
        if (tokenDecoded[1] !== hashed) {
            throw "INVALID_CREDENTIALS";
        }
        /* Damit das Timeout von der letzten Aktivität gerechnet wird, setzen wir es neu. */
        userinfo.lastActivity = new Date().valueOf();
        next();
    }
    catch (e)
    {
        res.send(JSON.stringify({ error: e }));
    }

};

/*
 * createCredentials(json)
 * Prüft die Daten des übergebenen Benutzers und liefert einen Token, der mit jedem Request 
 * mitgesendet wird. 
 * Parameter userinfo: {user:string, pass:string useragent:string, ip:string}
 * Return: token oder false, wenn der User nicht bekannt ist.
 */
Messageserver.prototype.createCredentials = function (userinfo) {
    if (!isType("string", userinfo.user, userinfo.pass)) return false;

    /* TODO: User gegen die Datenbank prüfen. */
    var secret = crypto.randomBytes(32).toString('base64');
    var toHash = userinfo.useragent +
                 userinfo.ip +
                 secret;
    var hashed = crypto.createHmac('sha256', secret)
                       .update(toHash)
                       .digest('base64');
    var token = new Buffer(userinfo.user + ":" + hashed)
        .toString('base64');

    /* Zum Testen */
    console.log("Token:", token);
    console.log("Decodierder Token:", new Buffer(token, 'base64').toString('utf8'));

    /* Das Secret und den Timestamp zu den Userinfos dazugeben und den User anlegen. */
    userinfo.secret = secret;
    userinfo.lastActivity = new Date().valueOf();
    this.userlist[userinfo.user] = userinfo;
    return token;
};

/*
 * logger.show(string) bzw. logger.error(string)
 * Gibt den übergebenen String mit einem Timestamp in der Konsole aus.
 * Parameter message: Auszugebende Meldung
 */
Messageserver.logger = {
    "show": function (message) {
        var _date = new Date();
        console.log(_date.toISOString() + " " + message.toString());
    },
    "error": function (message) {
        var _date = new Date();
        console.error("\033[91m"+_date.toISOString() + " " + message.toString()+"\033[0m");
    }
};

/*
 * isType(string, variable1, variable2, ...)
 * Prüft, ob alle Variablen den im 1. Parameter angegebenen String entsprechen.
 * Der Typname kann folgende Werte beinhalten: 
 * "undefined", "object", "boolean", "number", "string", "symbol", "function"
 */
function isType() {
    try {
        var reqType = arguments[0];
        for (var i = arguments.length - 1; i >= 1; --i) {
            if (typeof arguments[i] !== reqType) return false;
        }
        return true;
    }
    catch (e) {
    }
    return false;
}

/*
 * Export des Messageservers. Sonst ist diese Klasse nicht im aufrufenden Programm bekannt.
 */
module.exports = Messageserver;
