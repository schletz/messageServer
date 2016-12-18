/*jslint node:true, this:true, white:true*/
"use strict";
var ws = require("nodejs-websocket");   // npm install nodejs-websocket
var crypto = require('crypto');             // npm install crypto

/**
 * Implementiert alle Funktionen zum Senden und Empfangen von Nachrichten.
 * @class
 * @param {object} dbModel Das Sequelize Datenbankmodell
 * @param {json} config {authTimeout:int, websocketPort:int}
 */
function Messageserver(dbModel, config) {
    var self = this;                         // Für die private Funktion onWebsocketConnect
    this.userlist = {};                      // Alle angemeldeten User werden eingefügt.
    this.authTimeout = config.authTimeout;   // Diese Anzahl von Sekunden nach dem letzten Request 
    this.model = dbModel;                    // wird der Token ungültig.

    this.websocketServer = ws.
        createServer(onWebsocketConnect).
        listen(config.websocketPort);

    /**
    * onWebsocketConnect
    * Wird aufgerufen, wenn eine Verbindung vom Client zum Socketserver aufgebaut wurde. Mit dem
    * Pfad muss auch der Webserver Key übermittelt werden. Dieser wird in createCredentials beim
    * Anmelden generiert.
    * Dieser Key wird dann wieder gelöscht. Pro Anmeldung ist also nur 1 Connect möglich.
    * Wenn der Client nicht den richtigen Pfad verwendet (ws://..../messageserver/key), dann wird
    * die Verbindung sofort wieder geschlossen.
    * @param {object} conn Repräsentiert die Socketverbindung
    */
    function onWebsocketConnect(conn) {
        var matches = conn.path.match(/^\/messageserver\/([0-9a-f]{32,})$/);
        var keyOk = false;

        /* Ist der Key überhaupt ein Hexstring mit mind. 32 Stellen (128 bit)? */
        if (matches === null) {
            conn.close();
            return;
        }

        /* Ist der Key gültig? */
        Object.keys(self.userlist).forEach(function (user) {
            if (self.userlist[user].websocketKey === matches[1]) {
                keyOk = true;
                self.userlist[user].websocketKey = "";         // Key darf nur 1x verwendet werden.
                return;
            }
        });
        if (keyOk) {
            Messageserver.logger.show("Websocket client connected: " + conn.headers.origin);
        }
        else {
            Messageserver.logger.show("Falscher Websocket Key: " + matches[1]);
        }
    }
}

/** 
 * setHeader
 * Setzt die HTTP Header, sodass von jeder Domäne aus das Webservice aufgerufen werden kann.
 * Weiters wird der Content Type der Antwort auf JSON gesetzt.
 * @memberof Messageserver
 */
Messageserver.prototype.setHeader = function (req, res, next) {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
};


/**
 * getMessages
 * Liest alle Nachrichten aus der Messages Tabelle und liefert sie zurück.
 * @memberof Messageserver
 * @param {function} onSuccess(rows:json) Übergibt ein JSON Array mit der Zeile aus der Messages 
 * Tabelle und dem dazugehörigen Autor in der Form 
 * [{created:string, text:string, autor: {username:string, email:string}},...]
 * @param {function} onError(message:string) Fehlermeldung, falls die Datenbankabfrage nicht
 * funktioniert hat.
 */
Messageserver.prototype.getMessages = function (onSuccess, onError) {
    onSuccess = typeof onSuccess === "function" ? onSuccess : function () { return; };
    onError = typeof onError === "function" ? onError : function () { return; };

    /* Auch den User zur Nachricht raussuchen. Siehe Eager loading auf 
     * http://docs.sequelizejs.com/en/latest/docs/models-usage/
     * Das as muss mit dem im Model bei belongsTo() definiertem Alias übereinstimmen.
     */
    this.model.Message.findAll({
        attributes: ["created", "text"],
        include: [{ model: this.model.User, attributes: ["username", "email"], as: 'autor' }]
    }).then(
        function (result) {
            onSuccess(result);
        }).catch(function (err) { return onError(err.errors[0].message); });

    /* So könnte man alle User mit ihren Nachrichten auslesen. Da kein as definiert wurde, muss es
     * auch nicht angegeben werden. */
    /*
    this.model.User.findAll({include:[{model:this.model.Message}]}).then(function(result) {
        onSuccess(result);
    }).catch (onError);    
    */
};

/**
 * Sendet allen verbundenen Clients die in messageStr enthaltene Nachricht. Weiters wird der String
 * in die Tabelle messages geschrieben.
 * @memberof Messageserver
 * @param {string} autor Der Username des Autors
 * @param {string} messageStr Die Nachricht, die zu senden ist.
 * @param {function} onSuccess(json) Übergibt die gesendete Nachricht im Format 
 * {autor:string, message:string}
 * @param {function} onError(string) Übergibt die Fehlermeldung, falls beim Senden ein
 * Fehler aufgetreten ist.
 */
Messageserver.prototype.sendMessageToAll = function (autor, messageStr, onSuccess, onError) {
    onSuccess = typeof onSuccess === "function" ? onSuccess : function () { return; };
    onError = typeof onError === "function" ? onError : function () { return; };
    if (!isType("string", autor, messageStr)) { onError("INVALID_ARGUMENT"); return; }
    var self = this;     // Für den Zugriff auf den Messageserver  in der findObe Callback Funktion.

    /* Den User heraussuchen und die Nachricht bei ihm einfügen. Danach wird dieser Test über den
     * Websocket Server an alle Clients gesendet. */
    this.model.User.findOne({ where: { username: autor } }).then(function (result) {
        result.createMessage({ text: messageStr }).then(function (result) {
            try {
                self.websocketServer.connections.forEach(function (conn) {
                    conn.sendText(JSON.stringify({ autor: autor, message: messageStr }));
                });
                onSuccess({ autor: autor, message: messageStr });
            }
            catch (err) {
                return onError(err);
            }
        });
    });
};

/**
* checkCredentials
* Prüft den übergebenen Token. Dieser Token ist base64 Codiert und hat den Aufbau user:hash
* user: Username, für den der Token geneiert wurde
* hash: Hashwert von IP, Useragent und einer Zufallszahl
*
* Wenn dieser gültig ist, dann wird die in onSuccess übergebene 
* Funktion aufgerufen und die Gültigkeitszeit des Tokens neu gesetzt.
* @memberof Messageserver
* @param {string} token Der übermittelte, zu prüfende Token.
* @param {string} userAgent Der übermittelte HTTP User Agent.
* @param {string} clientIp Die IP Adresse des Clients.
* @param {function} onSuccess(username:string) Wird aufgerufen, wenn der Token gültig ist.
* @param {function} onError(message:string) Wenn der Token üntültig ist, wird die message auf
* "INVALID_ARGUMENT", "INVALID_TOKEN",  "NOT_AUTH", "AUTH_TIMEOUT" oder "INVALID_CREDENTIALS" 
* gesetzt.
*/
Messageserver.prototype.checkCredentials = function (token, userAgent, clientIp, onSuccess, onError) {
    onSuccess = typeof onSuccess === "function" ? onSuccess : function () { return; };
    onError = typeof onError === "function" ? onError : function () { return; };

    /* Argumente übergeben? */
    if (!isType("string", token)) { onError("INVALID_ARGUMENT"); return; }
    if (!isType("string", userAgent)) { onError("INVALID_ARGUMENT"); return; }
    if (!isType("string", clientIp)) { onError("INVALID_ARGUMENT"); return; }

    var tokenDecoded = new Buffer(token, 'hex').toString('utf8').split(":");
    if (tokenDecoded.length != 2) {
        return onError("INVALID_TOKEN");
    }
    /* Ist der User in unserer Userlist? */
    var userinfo = this.userlist[tokenDecoded[0]];
    if (!isType("object", userinfo)) { onError("NOT_AUTH"); return; }
    /* 
     * Stimmt der Hashwert von IP, Useragent und Secret, wenn wir ihn neu generieren, 
     * mit dem übermittelten überein und ist er auch nicht abgelaufen? 
     */
    var toHash = userAgent + clientIp + userinfo.secret;
    var hashed = crypto.createHmac('sha256', userinfo.secret)
        .update(toHash)
        .digest('base64');
    /* Ist der Token abgelaufen? */
    if (new Date().valueOf() - this.authTimeout * 1000 > userinfo.lastActivity) {
        return onError("AUTH_TIMEOUT");
    }
    /* Stimmt der Hashwert noch? */
    if (tokenDecoded[1] !== hashed) {
        return onError("INVALID_CREDENTIALS");
    }
    /* Damit das Timeout von der letzten Aktivität gerechnet wird, setzen wir es neu. */
    userinfo.lastActivity = new Date().valueOf();
    onSuccess(tokenDecoded[0]);
};

/**
 * createCredentials
 * Prüft die Daten des übergebenen Benutzers und liefert einen Token, der mit jedem Request 
 * mitgesendet wird. 
 * @memberof Messageserver
 * @param {json} userinfo {user:string, pass:string useragent:string, ip:string}
 * @param {function} onSuccess(token:object) Ein JSON Objekt mit {token:string, websocketKey:string}
 * @param {function} onError(message:string) Im Fehlerfall wird INVALID_ARGUMENT, INVALID_USER oder 
 * INVALID_PASSWORD zurückgegeben.
 */
Messageserver.prototype.createCredentials = function (userinfo, onSuccess, onError) {
    var self = this;                          // Da in der Callback Methode der DB this sich ändert.
    onSuccess = typeof onSuccess === "function" ? onSuccess : function () { return; };
    onError = typeof onError === "function" ? onError : function () { return; };

    if (!isType("string", userinfo.user, userinfo.pass)) {
        return onError("INVALID_ARGUMENT");
    }

    /* Den übergebenen User in der Datenbank suchen */
    this.model.User.findOne({ where: { username: userinfo.user } }).then(function (currentUser) {
        try {
            /* Benutzer ist vorhanden */
            if (currentUser !== null) {
                /* Lässt sich aus dem Passwort und dem gespeicherten Salt der gespeicherten Hashwert
                * generieren? */
                var passwordHash = crypto.createHmac('sha256', currentUser.salt)
                    .update(userinfo.pass)
                    .digest('base64');

                /* Hash ungleich: falsches Passwort! */
                if (passwordHash !== currentUser.pass) {
                    return onError("INVALID_PASSWORD");
                }

                /* Alles OK: Token generieren und in die lokale Userliste des Servers eintragen */
                var secret = crypto.randomBytes(32).toString('base64');
                var toHash = userinfo.useragent +
                    userinfo.ip +
                    secret;
                var hashed = crypto.createHmac('sha256', secret)
                    .update(toHash)
                    .digest('base64');
                var token = new Buffer(userinfo.user + ":" + hashed)
                    .toString('hex');

                /* Das Secret und den Timestamp zu den Userinfos dazugeben und den User anlegen. 
                 * Weiters wird ein Key für den Websocket Server generiert, der ganau 1x für den
                 * Connect verwendet werden kann */
                userinfo.secret = secret;
                userinfo.lastActivity = new Date().valueOf();
                userinfo.websocketKey = crypto.randomBytes(32).toString('hex');
                self.userlist[userinfo.user] = userinfo;
                onSuccess({ token: token, websocketKey: userinfo.websocketKey });
            }
            else {
                return onError("INVALID_USER");
            }
        }
        catch (err) {
            return onError(err.message);
        }
    }).catch(function (err) { return onError(err.errors[0].message); });
};

/**
 * createUser
 * Erstellt einen User in der Datenbank und gibt den gesamten Datensatz zurück.
 * @memberof Messageserver
 * @param {json} userdata Ein JSON Objekt mit {user:string, pass:string, email.string}
 * @param {function} onSuccess(result:object) Ein JSON Objekt mit der Zeile aus der Usertabelle.
 * @param {function} onError(message:string) Im Fehlerfall wird die SQL Fehlermeldung zurückgegeben.
 */
Messageserver.prototype.createUser = function (userdata, onSuccess, onError) {
    var self = this;                          // Da in der Callback Methode der DB this sich ändert.
    onSuccess = typeof onSuccess === "function" ? onSuccess : function () { return; };
    onError = typeof onError === "function" ? onError : function () { return; };
    if (!isType("string", userdata.user, userdata.pass, userdata.email)) {
        return onError("INVALID_ARGUMENT");
    }

    this.model.User.create({
        username: userdata.user,
        pass: userdata.pass,
        email: userdata.email
    }).then(function (result) {
        onSuccess({ user: result.username, email: result.email });
    }).catch(function (err) { return onError(err.errors[0].message); });
};

/**
 * logger.show(string) bzw. logger.error(string)
 * Gibt den übergebenen String mit einem Timestamp in der Konsole aus.
 * Parameter message: Auszugebende Meldung
 */
Messageserver.logger = {
    "show": function (message) {
        var now = new Date();
        console.log("INFO@" + now.toISOString() + "\r\n" + message.toString());
    },
    "error": function (message) {
        var now = new Date();
        console.error("ERROR@" + now.toISOString() + "\r\n" + message.toString());
    }
};

/**
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
